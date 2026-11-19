import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool, migrate, PostgresStaffRepository, type Pool, type StaffEnrollmentIntentBinding } from '@debateai/db';
import { withMailLocale } from '../../packages/db/src/mail-locale.js';
import { StaffWebAuthnService } from '../../apps/api/src/staff/webauthn.js';
import { authorizeStaffAlertFixture } from '../support/staffAlertReadiness.js';
import { initializeOwnerRecoveryFixture } from '../support/staffOwnerRecoveryFixture.js';
import { b64, digest, fixture, key, origin, rpId } from '../support/staffWebAuthnFixtures.js';
import { createSystemTwin } from '../support/rls-logins.js';
import { startTestDatabase, type TestDatabase } from '../support/testDatabase.js';

/**
 * 0183: a staff member whose staff key belongs to another site name enrols one key under the current name, once, with
 * password and authenticator code, only while an operator's permit is current, and only from the sign-in the operator named. The site's current name here is the
 * fixtures' (admin.example.test); OLD_NAME stands for the name the site answered as before it was renamed.
 */
const OLD_NAME = 'old.example.test', OLD_ORIGIN = 'https://old.example.test';
const env = { v: 1 as const, keyId: 'fixture', nonce: 'AAAAAAAAAAAAAAAA', tag: 'AAAAAAAAAAAAAAAAAAAAAA==', ct: 'YQ==' };
const SOURCE = { ipArgon2id: 'argon2id-audit:v1:' + '0'.repeat(64), userAgentArgon2id: 'argon2id-audit:v1:' + '1'.repeat(64) };
const RECOVERY_PASSWORD = 'rekey-recovery-test-only';

let database: TestDatabase, runtime: Pool, system: Pool, repo: PostgresStaffRepository, service: StaffWebAuthnService;

type Account = { userId: string; ordinarySessionId: string; factorId: string; ownerRef: string; tokenHash: string; step: number };
type Staff = Account & { staffId: string };

async function session(userId: string): Promise<{ ordinarySessionId: string; tokenHash: string }> {
  const ordinarySessionId = randomUUID(), tokenHash = digest(ordinarySessionId);
  await database.pool.query(`INSERT INTO identity.session(session_id,user_id,token_hash,csrf_token_hash,binding_context,idle_expires_at,absolute_expires_at,last_mfa_at)
    VALUES($1,$2,$3,$4,'{}',now()+interval '1 hour',now()+interval '2 hours',now())`, [ordinarySessionId, userId, tokenHash, digest('csrf' + ordinarySessionId)]);
  return { ordinarySessionId, tokenHash };
}

/** An active account with a verified e-mail, an authenticator and one live sign-in. */
async function account(): Promise<Account> {
  const userId = randomUUID(), factorId = randomUUID();
  await database.pool.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
    VALUES($1,$2,'{}','{}','fixture-password',$3,'active',now())`, [userId, createHash('sha256').update(userId).digest(), userId]);
  await database.pool.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,created_at,verified_at,last_accepted_step)
    VALUES($1,$2,'totp','{}','active',now(),now(),1)`, [factorId, userId]);
  await database.pool.query(`INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,created_at,verified_at) VALUES($1,'email','{}','verified',now(),now())`, [userId]);
  const ownerRef = (await database.pool.query('SELECT owner_ref FROM identity."user" WHERE user_id=$1', [userId])).rows[0].owner_ref as string;
  return { userId, factorId, ownerRef, step: 1, ...(await session(userId)) };
}

/** A staff key row as an earlier enrolment left it, under the given site name. */
async function keyUnder(a: Account, name: string, nameOrigin: string): Promise<string> {
  const id = randomUUID(), credentialId = b64(randomBytes(32));
  await withMailLocale(database.pool, 'en', (c) => c.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,credential_id,public_key,state,created_at,verified_at,relying_party_id,credential_origin,user_verification_required,backup_eligible,backup_state,device_label_ciphertext,signature_counter)
    VALUES($1,$2,'passkey',$3,$4,'active',now(),now(),$5,$6,true,false,false,$7,0)`, [id, a.userId, credentialId, { format: 'COSE_KEY_BASE64URL_V1', value: b64(key().wire) }, name, nameOrigin, { ...env, keyId: 'passkey-label:' + id + ':v1' }]));
  await withMailLocale(database.pool, 'en', (c) => c.query('INSERT INTO identity.staff_webauthn_metadata(mfa_factor_id,user_id,user_handle_sha256,transports) VALUES($1,$2,$3,$4)', [id, a.userId, digest(randomBytes(32)), ['usb']]));
  return id;
}

/** A staff member whose only staff key belongs to the old name: the state a rename leaves. */
async function staffAfterRename(owner = false): Promise<Staff> {
  const a = await account(), staffId = randomUUID();
  await database.pool.query('INSERT INTO staff.subject(staff_id,user_id,capabilities) VALUES($1,$2,$3)', [staffId, a.userId, ['TEAM_READ']]);
  if (owner) {
    await database.pool.query('UPDATE staff.owner_designation SET active=false WHERE active');
    await database.pool.query('INSERT INTO staff.owner_designation(staff_id) VALUES($1)', [staffId]);
  }
  await keyUnder(a, OLD_NAME, OLD_ORIGIN);
  return { ...a, staffId };
}

/** The operator's side: the staff recovery login, opened for under five minutes, makes the call, then is closed again. */
async function asRecovery<T>(call: (jit: Pool) => Promise<T>, validFor = '4 minutes'): Promise<T> {
  const expiry = (await database.pool.query(`SELECT (clock_timestamp()+interval '${validFor}')::text AS value`)).rows[0].value as string;
  await database.pool.query(`ALTER ROLE debateai_prod_staff_recovery LOGIN PASSWORD '${RECOVERY_PASSWORD}' VALID UNTIL '${expiry}'`);
  const url = new URL(database.connectionString); url.username = 'debateai_prod_staff_recovery'; url.password = RECOVERY_PASSWORD;
  const jit = createPool(url.toString());
  try { return await call(jit); }
  finally { await jit.end(); await database.pool.query("ALTER ROLE debateai_prod_staff_recovery PASSWORD NULL VALID UNTIL '-infinity'"); }
}
type Armed = { permitId: string; expiresAt: string; sessionStartedAt: string; otherSignIns: number };
/** A sign-in's code, as Settings shows it to that sign-in's own browser: the first eight characters of its id. */
const codeOf = (a: Pick<Account, 'ordinarySessionId'>) => a.ordinarySessionId.slice(0, 8);
const armRaw = (userId: string | null, signIn: string, name = rpId, nameOrigin = origin) =>
  asRecovery(async (jit) => (await jit.query('SELECT staff.arm_rekey($1::uuid,$2,$3,$4) AS value', [userId, name, nameOrigin, signIn])).rows[0].value as Armed);
/** The operator arms a permit for this person's sign-in, naming it by the code read in their browser. */
const arm = (a: Account, name = rpId, nameOrigin = origin) => armRaw(a.userId, codeOf(a), name, nameOrigin);

/** The password and code check, as the API's request login makes it. Each call uses the next authenticator step and rotates the sign-in's token. */
async function prerequisite(a: Account, fn = 'staff.step_up_prerequisite_v2'): Promise<string> {
  const handle = b64(randomBytes(32)), replacement = digest(randomBytes(32)), step = a.step + 1;
  await runtime.query(`SELECT ${fn}($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14,$15)`,
    [a.userId, a.ownerRef, 'fixture-password', a.factorId, step, a.ordinarySessionId, a.tokenHash, replacement, digest(randomBytes(32)), {}, SOURCE, digest(handle), 'KEY_PREREGISTRATION', null, null]);
  a.step = step; a.tokenHash = replacement;
  return handle;
}

const newKey = () => fixture(key(), 1, randomBytes(32));
type NewKey = ReturnType<typeof newKey>;
const registration = (f: NewKey, challenge: string) => ({ ...f.registration, response: { ...f.registration.response, clientDataJSON: b64(Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge, origin }))) } });
/** A signature by the new key. The user handle is the one the site chose when the key was enrolled, which the key gives back. */
const assertion = (f: NewKey, challenge: string, counter: number, userHandle: string) => {
  const signed = f.assertion({ client: Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin })), auth: f.auth(5, counter) });
  return { ...signed, response: { ...signed.response, userHandle } };
};
const request = (options: { challenge_handle: string }, credential: unknown) => ({ challenge_handle: options.challenge_handle, credential });
const enrollmentIntent = async (input: StaffEnrollmentIntentBinding) => {
  await authorizeStaffAlertFixture(database.pool, input.operationId);
  return { operationId: input.operationId, factorId: input.factorId, deviceLabelEnvelope: { ...env, keyId: 'passkey-label:' + input.factorId + ':v1' },
    alertIntent: { schema: 'staff-alert-v1' as const, event: 'KEY_CHANGE' as const, operationId: input.operationId, envelope: env } };
};
const begin = (a: Account, handle: string, operationId = randomUUID()) => service.beginRegistration(a, { kind: 'PREREQUISITE', prerequisiteHandle: handle, operationId });
const finish = (a: Account, options: Awaited<ReturnType<typeof begin>>, f: NewKey) => service.finishRegistration(a, request(options, registration(f, options.options.challenge)), enrollmentIntent);

const keysUnder = async (a: Account, name: string) => (await database.pool.query(
  `SELECT count(*)::int AS n FROM identity.mfa_factor f JOIN identity.staff_webauthn_metadata m USING(mfa_factor_id) WHERE f.user_id=$1 AND f.factor_type='passkey' AND f.state='active' AND f.relying_party_id=$2`, [a.userId, name])).rows[0].n as number;
const permitOf = async (a: Account) => (await database.pool.query('SELECT * FROM staff.rekey_permit WHERE user_id=$1 ORDER BY armed_at DESC LIMIT 1', [a.userId])).rows[0];

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  await initializeOwnerRecoveryFixture(database.pool, database.connectionString);
  await database.pool.query(`CREATE ROLE rekey_test_runtime LOGIN PASSWORD 'rekey-test-only' IN ROLE debateai_runtime`);
  const url = new URL(database.connectionString); url.username = 'rekey_test_runtime'; url.password = 'rekey-test-only';
  runtime = createPool(url.toString());
  system = createPool(await createSystemTwin(database, 'rekey_test_system', ['debateai_runtime']));
  repo = new PostgresStaffRepository(system);
  service = new StaffWebAuthnService(repo, { publicAppUrl: origin });
}, 120000);
afterAll(async () => { await runtime?.end(); await system?.end(); await database?.stop(); });

describe('without a permit nothing changed', () => {
  it('still refuses a staff member who has only password and code, on the old and the new entry points', async () => {
    const a = await staffAfterRename();
    await expect(prerequisite(a)).rejects.toThrow('STAFF_EXISTING_SUBJECT_REQUIRES_KEY_PROOF');
    await expect(prerequisite(a, 'staff.step_up_prerequisite')).rejects.toThrow('STAFF_EXISTING_SUBJECT_REQUIRES_KEY_PROOF');
    await expect(begin(a, b64(randomBytes(32)))).rejects.toThrow('STAFF_KEY_PROOF_REQUIRED');
    expect(await keysUnder(a, rpId)).toBe(0);
    expect((await database.pool.query('SELECT count(*)::int AS n FROM staff.prerequisite_receipt WHERE user_id=$1', [a.userId])).rows[0].n).toBe(0);
  });

  it('still lets an account that is not staff yet enrol its first key through the new entry points', async () => {
    const a = await account(), f = newKey();
    const result = await finish(a, await begin(a, await prerequisite(a)), f);
    expect(result.credentialId).toBe(f.expected.credentialId);
    expect(await keysUnder(a, rpId)).toBe(1);
    expect((await database.pool.query('SELECT count(*)::int AS n FROM staff.rekey_permit WHERE user_id=$1', [a.userId])).rows[0].n).toBe(0);
  });
});

describe('with a permit', () => {
  it('accepts exactly one key under the current name, uses the permit up, and writes the audit row and the alert', async () => {
    const a = await staffAfterRename(), f = newKey(), operationId = randomUUID();
    const armed = await arm(a);
    expect(new Date(armed.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(15 * 60 * 1000);
    expect(new Date(armed.expiresAt).getTime() - Date.now()).toBeGreaterThan(14 * 60 * 1000);
    expect(armed).not.toHaveProperty('userId');

    const options = await begin(a, await prerequisite(a), operationId);
    expect(options.options.rp.id).toBe(rpId);
    expect(options.options.excludeCredentials).toEqual([]);
    const result = await finish(a, options, f);
    expect(result.credentialId).toBe(f.expected.credentialId);
    expect(result.receipt.outcome).toBe('COMPLETED');

    const stored = (await database.pool.query(`SELECT state,relying_party_id,credential_origin,verified_at IS NOT NULL AS verified FROM identity.mfa_factor WHERE credential_id=$1`, [f.expected.credentialId])).rows;
    expect(stored).toEqual([{ state: 'active', relying_party_id: rpId, credential_origin: origin, verified: true }]);
    expect(await keysUnder(a, rpId)).toBe(1);
    expect(await keysUnder(a, OLD_NAME)).toBe(1);

    const permit = await permitOf(a);
    expect(permit.consumed_at).not.toBeNull();
    const challenge = (await database.pool.query('SELECT challenge_id,consumed_at,staff_id FROM staff.webauthn_challenge WHERE handle_sha256=$1', [digest(options.challenge_handle)])).rows[0];
    expect(permit.registration_challenge_id).toBe(challenge.challenge_id);
    expect(challenge.consumed_at).not.toBeNull();

    const audit = (await database.pool.query('SELECT event_id,event_type,actor_staff_id,subject_staff_id,reason_code FROM staff.audit_event WHERE operation_id=$1', [operationId])).rows;
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ event_type: 'KEY_CHANGE', actor_staff_id: a.staffId, subject_staff_id: a.staffId, reason_code: 'KEY_MAINTENANCE' });
    expect((await database.pool.query(`SELECT purpose FROM staff.alert_outbox WHERE event_id=$1`, [audit[0].event_id])).rows).toEqual([{ purpose: 'INDEPENDENT_METADATA_ALERT' }]);

    // The new key now proves the staff member under the current name.
    const elevation = await service.beginElevation(a);
    expect(elevation.options.allowCredentials.map((c) => c.id)).toEqual([f.expected.credentialId]);
    expect((await service.finishElevation(a, request(elevation, assertion(f, elevation.options.challenge, 2, options.options.user.id)))).staffToken).toBeTruthy();

    // The permit is gone: password and code alone are refused again, and a second permit is refused while that key works.
    await expect(prerequisite(a)).rejects.toThrow('STAFF_EXISTING_SUBJECT_REQUIRES_KEY_PROOF');
    await expect(arm(a)).rejects.toThrow('STAFF_REKEY_KEY_PRESENT');
    expect(await keysUnder(a, rpId)).toBe(1);
  });

  it('is used up when the key ceremony starts: no second ceremony starts, whatever receipt it comes with', async () => {
    const a = await staffAfterRename();
    await arm(a);
    // Before the ceremony starts the permit is still current, so the check may be passed again; only the newest receipt counts.
    const superseded = await prerequisite(a), handle = await prerequisite(a);
    await expect(begin(a, superseded)).rejects.toThrow('STAFF_PREREQUISITE_INVALID');
    expect((await permitOf(a)).consumed_at).toBeNull();
    const options = await begin(a, handle);
    expect((await permitOf(a)).consumed_at).not.toBeNull();
    // After it: the password and code check is refused again, and so is a start with the receipt just used.
    await expect(prerequisite(a)).rejects.toThrow('STAFF_EXISTING_SUBJECT_REQUIRES_KEY_PROOF');
    await expect(begin(a, handle)).rejects.toThrow('STAFF_KEY_PROOF_REQUIRED');
    // Even a receipt made fresh again by hand starts nothing: the permit itself is what was used up.
    const used = (await database.pool.query('SELECT consumed_at,registration_challenge_id FROM staff.prerequisite_receipt WHERE handle_sha256=$1', [digest(handle)])).rows[0];
    await database.pool.query('UPDATE staff.prerequisite_receipt SET consumed_at=NULL,registration_challenge_id=NULL WHERE handle_sha256=$1', [digest(handle)]);
    await expect(begin(a, handle)).rejects.toThrow('STAFF_KEY_PROOF_REQUIRED');
    await database.pool.query('UPDATE staff.prerequisite_receipt SET consumed_at=$2,registration_challenge_id=$3 WHERE handle_sha256=$1', [digest(handle), used.consumed_at, used.registration_challenge_id]);
    expect((await database.pool.query("SELECT count(*)::int AS n FROM staff.webauthn_challenge WHERE user_id=$1 AND purpose='REGISTRATION'", [a.userId])).rows[0].n).toBe(1);
    await finish(a, options, newKey());
    expect(await keysUnder(a, rpId)).toBe(1);
  });

  it('never leaves a second key: a ceremony whose name already has a working key is refused at the key insert', async () => {
    const a = await staffAfterRename();
    await arm(a);
    const options = await begin(a, await prerequisite(a)), f = newKey();
    await keyUnder(a, rpId, origin);
    await expect(finish(a, options, f)).rejects.toThrow('STAFF_KEY_PROOF_REQUIRED');
    expect((await database.pool.query('SELECT count(*)::int AS n FROM identity.mfa_factor WHERE credential_id=$1', [f.expected.credentialId])).rows[0].n).toBe(0);
  });

  it('arms the one active Owner when no account is named', async () => {
    const a = await staffAfterRename(true);
    await armRaw(null, codeOf(a));
    expect((await permitOf(a)).staff_id).toBe(a.staffId);
    await finish(a, await begin(a, await prerequisite(a)), newKey());
    expect(await keysUnder(a, rpId)).toBe(1);
    await database.pool.query('UPDATE staff.owner_designation SET active=false WHERE active');
    await expect(armRaw(null, codeOf(a))).rejects.toThrow('STAFF_REKEY_TARGET_INVALID');
  });

  it('rolls the key, the audit row and the alert back together when the independent alert is not ready', async () => {
    const a = await staffAfterRename(), f = newKey(), operationId = randomUUID();
    await arm(a);
    const options = await begin(a, await prerequisite(a), operationId);
    await database.pool.query('DELETE FROM staff.independent_alert_readiness');
    await expect(service.finishRegistration(a, request(options, registration(f, options.options.challenge)), async (input) => ({ operationId: input.operationId, factorId: input.factorId,
      deviceLabelEnvelope: { ...env, keyId: 'passkey-label:' + input.factorId + ':v1' }, alertIntent: { schema: 'staff-alert-v1', event: 'KEY_CHANGE', operationId: input.operationId, envelope: env } }))).rejects.toThrow('STAFF_ALERT_UNAVAILABLE');
    expect(await keysUnder(a, rpId)).toBe(0);
    expect((await database.pool.query('SELECT count(*)::int AS n FROM staff.audit_event WHERE operation_id=$1', [operationId])).rows[0].n).toBe(0);
    // The same ceremony may still finish once the alert is ready (it has not expired and was not consumed).
    await finish(a, options, f);
    expect(await keysUnder(a, rpId)).toBe(1);
  });
});

describe('a permit that may not be used', () => {
  const expire = (a: Account) => database.pool.query("UPDATE staff.rekey_permit SET armed_at=armed_at-interval '20 minutes',expires_at=expires_at-interval '20 minutes' WHERE user_id=$1", [a.userId]);

  it('refuses an expired permit at the password and code check and at the start of the ceremony', async () => {
    const a = await staffAfterRename();
    await arm(a);
    const handle = await prerequisite(a);
    await expire(a);
    await expect(prerequisite(a)).rejects.toThrow('STAFF_EXISTING_SUBJECT_REQUIRES_KEY_PROOF');
    await expect(begin(a, handle)).rejects.toThrow('STAFF_KEY_PROOF_REQUIRED');
    expect((await permitOf(a)).consumed_at).toBeNull();
    // An expired permit does not block a new one.
    await arm(a);
    await finish(a, await begin(a, await prerequisite(a)), newKey());
    expect(await keysUnder(a, rpId)).toBe(1);
  });

  it('is for one person: another staff member, and an account that is not staff, gain nothing from it', async () => {
    const a = await staffAfterRename(), other = await staffAfterRename(), outsider = await account();
    await arm(a);
    await expect(prerequisite(other)).rejects.toThrow('STAFF_EXISTING_SUBJECT_REQUIRES_KEY_PROOF');
    const handle = await prerequisite(a);
    await expect(begin(other, handle)).rejects.toThrow();
    await expect(begin({ ...outsider, ordinarySessionId: a.ordinarySessionId }, handle)).rejects.toThrow();
    expect(await keysUnder(other, rpId)).toBe(0);
    expect((await permitOf(a)).consumed_at).toBeNull();
  });

  it('is for the sign-in the operator named: a later sign-in with the same password and code is refused', async () => {
    const a = await staffAfterRename();
    await arm(a);
    const stolen: Account = { ...a, ...(await session(a.userId)) };
    await expect(prerequisite(stolen)).rejects.toThrow('STAFF_EXISTING_SUBJECT_REQUIRES_KEY_PROOF');
    const handle = await prerequisite(a);
    await expect(begin(stolen, handle)).rejects.toThrow();
    expect((await permitOf(a)).consumed_at).toBeNull();
    expect(await keysUnder(a, rpId)).toBe(0);
  });

  it('is for one site name: a permit armed for another name starts no ceremony under this one', async () => {
    const a = await staffAfterRename();
    await arm(a, 'other.example.test', 'https://other.example.test');
    await expect(begin(a, await prerequisite(a))).rejects.toThrow('STAFF_KEY_PROOF_REQUIRED');
    expect((await permitOf(a)).consumed_at).toBeNull();
  });

  it.each(['hold', 'disabled', 'sign-out', 'ceremony-expired'])('stops a started ceremony when the account changed since (%s)', async (change) => {
    const a = await staffAfterRename(), f = newKey();
    await arm(a);
    const options = await begin(a, await prerequisite(a));
    if (change === 'hold') await database.pool.query('INSERT INTO identity.account_security_hold(user_id,held,security_epoch) VALUES($1,false,1)', [a.userId]);
    if (change === 'disabled') await database.pool.query("UPDATE staff.subject SET state='DISABLED',security_epoch=security_epoch+1 WHERE staff_id=$1", [a.staffId]);
    if (change === 'sign-out') await database.pool.query('UPDATE identity.session SET revoked_at=clock_timestamp() WHERE session_id=$1', [a.ordinarySessionId]);
    if (change === 'ceremony-expired') await database.pool.query('UPDATE staff.webauthn_challenge SET expires_at=created_at WHERE handle_sha256=$1', [digest(options.challenge_handle)]);
    await expect(finish(a, options, f)).rejects.toThrow();
    expect(await keysUnder(a, rpId)).toBe(0);
  });

  it('starts one ceremony when two starts race on two connections', async () => {
    const a = await staffAfterRename();
    await arm(a);
    const handle = await prerequisite(a);
    const results = await Promise.allSettled([begin(a, handle), begin(a, handle), begin(a, handle)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await database.pool.query("SELECT count(*)::int AS n FROM staff.webauthn_challenge WHERE user_id=$1 AND purpose='REGISTRATION'", [a.userId])).rows[0].n).toBe(1);
  });

  it('refuses the permit\'s steps inside a transaction that reads an older snapshot', async () => {
    const a = await staffAfterRename(), operationId = randomUUID(), factorId = randomUUID();
    await arm(a);
    const handle = await prerequisite(a), client = await system.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      await expect(client.query('SELECT staff.begin_owned_webauthn_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL,NULL,$10::jsonb)',
        [a.userId, a.ordinarySessionId, 'REGISTRATION', digest(randomBytes(32)), digest(randomBytes(32)), rpId, origin, digest(randomBytes(32)), operationId, { kind: 'PREREQUISITE', prerequisiteHandleHash: digest(handle) }])).rejects.toThrow('STAFF_CEREMONY_INVALID');
      await client.query('ROLLBACK');
      const options = await begin(a, handle, operationId);
      const challenge = (await database.pool.query('SELECT challenge_id FROM staff.webauthn_challenge WHERE handle_sha256=$1', [digest(options.challenge_handle)])).rows[0].challenge_id as string;
      await authorizeStaffAlertFixture(database.pool, operationId);
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      await client.query('SELECT 1');
      // The sign-in is revoked after the snapshot was taken; the completion must not finish on what it still sees.
      await database.pool.query('UPDATE identity.session SET revoked_at=clock_timestamp() WHERE session_id=$1', [a.ordinarySessionId]);
      await expect(client.query('SELECT staff.complete_owned_webauthn_registration_v2($1,$2,$3,$4,$5,$6,$7,$8::bigint,$9::jsonb,$10::text[],$11::jsonb)',
        [a.userId, a.ordinarySessionId, challenge, operationId, factorId, b64(randomBytes(32)), b64(randomBytes(64)), 0, { ...env, keyId: 'passkey-label:' + factorId + ':v1' }, ['usb'],
          { schema: 'staff-alert-v1', event: 'KEY_CHANGE', operationId, envelope: env }])).rejects.toThrow('STAFF_CEREMONY_INVALID');
    } finally { await client.query('ROLLBACK').catch(() => undefined); client.release(); }
    expect(await keysUnder(a, rpId)).toBe(0);
  });

  it('is not accepted by the older functions, which the release before still calls', async () => {
    const a = await staffAfterRename(), operationId = randomUUID(), factorId = randomUUID();
    await arm(a);
    const options = await begin(a, await prerequisite(a), operationId);
    const challenge = (await database.pool.query('SELECT challenge_id FROM staff.webauthn_challenge WHERE handle_sha256=$1', [digest(options.challenge_handle)])).rows[0].challenge_id as string;
    expect((await system.query('SELECT staff.read_owned_webauthn_challenge($1,$2,$3,$4,NULL,NULL,NULL) AS value', [a.userId, a.ordinarySessionId, digest(options.challenge_handle), 'REGISTRATION'])).rows[0].value).toBeNull();
    await authorizeStaffAlertFixture(database.pool, operationId);
    await expect(system.query('SELECT staff.complete_owned_webauthn_registration($1,$2,$3,$4,$5,$6,$7,$8::bigint,$9::jsonb,$10::text[],$11::jsonb)',
      [a.userId, a.ordinarySessionId, challenge, operationId, factorId, b64(randomBytes(32)), b64(randomBytes(64)), 0, { ...env, keyId: 'passkey-label:' + factorId + ':v1' }, ['usb'],
        { schema: 'staff-alert-v1', event: 'KEY_CHANGE', operationId, envelope: env }])).rejects.toThrow('STAFF_CEREMONY_INVALID');
    expect(await keysUnder(a, rpId)).toBe(0);
  });
});

describe('who may arm a permit, and for whom', () => {
  it('refuses everyone but the staff recovery login while it expires within five minutes', async () => {
    const a = await staffAfterRename();
    const call = (pool: Pool) => pool.query('SELECT staff.arm_rekey($1::uuid,$2,$3,$4)', [a.userId, rpId, origin, codeOf(a)]);
    await expect(call(runtime)).rejects.toThrow(/permission denied/);
    await expect(call(system)).rejects.toThrow(/permission denied/);
    await expect(call(database.pool)).rejects.toThrow('STAFF_RECOVERY_JIT_REQUIRED');
    await expect(asRecovery(call, '6 minutes')).rejects.toThrow('STAFF_RECOVERY_JIT_REQUIRED');
    expect(await permitOf(a)).toBeUndefined();
  });

  it('refuses an account that is not an active staff member', async () => {
    const outsider = await account(), disabled = await staffAfterRename(), held = await staffAfterRename();
    await database.pool.query("UPDATE staff.subject SET state='DISABLED',security_epoch=security_epoch+1 WHERE staff_id=$1", [disabled.staffId]);
    await database.pool.query('INSERT INTO identity.account_security_hold(user_id,held,security_epoch) VALUES($1,true,1)', [held.userId]);
    for (const target of [outsider, disabled, held]) await expect(arm(target)).rejects.toThrow('STAFF_REKEY_TARGET_INVALID');
    await expect(armRaw(randomUUID(), codeOf(outsider))).rejects.toThrow('STAFF_REKEY_TARGET_INVALID');
  });

  it('refuses a staff member who already has a working staff key under the name', async () => {
    const a = await staffAfterRename();
    await keyUnder(a, rpId, origin);
    await expect(arm(a)).rejects.toThrow('STAFF_REKEY_KEY_PRESENT');
    // A key that was revoked under this name is not a working key.
    const b = await staffAfterRename(), revoked = await keyUnder(b, rpId, origin);
    await withMailLocale(database.pool, 'en', (c) => c.query("UPDATE identity.mfa_factor SET state='revoked',revoked_at=clock_timestamp() WHERE mfa_factor_id=$1", [revoked]));
    await expect(arm(b)).resolves.toHaveProperty('permitId');
  });

  it('is for the sign-in the operator names by its code, whatever other sign-ins the account has', async () => {
    const a = await staffAfterRename(), other: Account = { ...a, ...(await session(a.userId)) };
    const started = (await database.pool.query('SELECT created_at FROM identity.session WHERE session_id=$1', [a.ordinarySessionId])).rows[0].created_at as Date;
    const armed = await arm(a);
    expect(new Date(armed.sessionStartedAt).getTime()).toBe(started.getTime());
    expect(armed.otherSignIns).toBe(1);
    expect((await permitOf(a)).ordinary_session_id).toBe(a.ordinarySessionId);
    // The other sign-in, made with the same password and code before the permit was armed, gains nothing.
    await expect(prerequisite(other)).rejects.toThrow('STAFF_EXISTING_SUBJECT_REQUIRES_KEY_PROOF');
    await finish(a, await begin(a, await prerequisite(a)), newKey());
    expect(await keysUnder(a, rpId)).toBe(1);
  });

  it('refuses a code that names no live sign-in of that person, or more than one', async () => {
    const a = await staffAfterRename(), stranger = await staffAfterRename();
    await expect(armRaw(a.userId, '00000000')).rejects.toThrow('STAFF_REKEY_SESSION_REQUIRED');
    await expect(armRaw(a.userId, codeOf(stranger))).rejects.toThrow('STAFF_REKEY_SESSION_REQUIRED');
    for (const code of ['', '3f9a1c2', '3F9A1C2E', '3f9a1c2e0', a.ordinarySessionId, "' OR '1'='1"]) await expect(armRaw(a.userId, code)).rejects.toThrow('STAFF_REKEY_INVALID');
    // Two live sign-ins that share the code: nobody could say which one was meant.
    const twin = a.ordinarySessionId.slice(0, 8) + randomUUID().slice(8);
    await database.pool.query(`INSERT INTO identity.session(session_id,user_id,token_hash,csrf_token_hash,binding_context,idle_expires_at,absolute_expires_at,last_mfa_at)
      VALUES($1,$2,$3,$4,'{}',now()+interval '1 hour',now()+interval '2 hours',now())`, [twin, a.userId, digest(twin), digest('csrf' + twin)]);
    await expect(arm(a)).rejects.toThrow('STAFF_REKEY_SESSION_REQUIRED');
    await database.pool.query('UPDATE identity.session SET revoked_at=clock_timestamp() WHERE session_id=$1', [twin]);
    await expect(arm(a)).resolves.toHaveProperty('permitId');
    // A signed-out or idle sign-in cannot be named.
    const gone = await staffAfterRename(), idle = await staffAfterRename();
    await database.pool.query('UPDATE identity.session SET revoked_at=clock_timestamp() WHERE session_id=$1', [gone.ordinarySessionId]);
    await database.pool.query("UPDATE identity.session SET created_at=created_at-interval '2 hours',last_seen_at=last_seen_at-interval '2 hours',idle_expires_at=clock_timestamp()-interval '1 minute' WHERE session_id=$1", [idle.ordinarySessionId]);
    await expect(arm(gone)).rejects.toThrow('STAFF_REKEY_SESSION_REQUIRED');
    await expect(arm(idle)).rejects.toThrow('STAFF_REKEY_SESSION_REQUIRED');
    expect(await permitOf(gone)).toBeUndefined();
  });

  it('gives a thief nothing who signs in with the stolen password and code and signs the Owner out before the operator arms', async () => {
    const owner = await staffAfterRename(true);
    // The thief's own sign-in, then the Owner's sign-in revoked from it: the thief's is now the account's only live sign-in.
    const thief: Account = { ...owner, ...(await session(owner.userId)) };
    await database.pool.query('UPDATE identity.session SET revoked_at=clock_timestamp() WHERE session_id=$1', [owner.ordinarySessionId]);
    // The operator types the code read in the Owner's own browser, which the thief's sign-in does not carry.
    await expect(armRaw(null, codeOf(owner))).rejects.toThrow('STAFF_REKEY_SESSION_REQUIRED');
    expect(await permitOf(owner)).toBeUndefined();
    await expect(prerequisite(thief)).rejects.toThrow('STAFF_EXISTING_SUBJECT_REQUIRES_KEY_PROOF');
    expect(await keysUnder(owner, rpId)).toBe(0);
  });

  it('refuses a second permit while one is current, and a name that is not a plain https site name', async () => {
    const a = await staffAfterRename();
    await arm(a);
    await expect(arm(a)).rejects.toThrow('STAFF_REKEY_PERMIT_ACTIVE');
    const b = await staffAfterRename();
    for (const [name, nameOrigin] of [[rpId, 'http://' + rpId], [rpId, origin + '/'], [rpId, OLD_ORIGIN], ['', 'https://'], ['Admin.Example.Test', 'https://Admin.Example.Test'], [rpId + ':8443', origin + ':8443']] as const)
      await expect(arm(b, name, nameOrigin)).rejects.toThrow('STAFF_REKEY_INVALID');
    expect(await permitOf(b)).toBeUndefined();
  });

  it('the runbook\'s own database checks hold on a migrated database', async () => {
    // MAIN-SITE.md's scripts ask the database whether the re-key step is there and whether the tool's login is admitted.
    // A check that names a function the step does not create would refuse on every server, so each one is run here.
    const runbook = readFileSync(new URL('../../deploy/preview-auth-dev/v1/MAIN-SITE.md', import.meta.url), 'utf8');
    const queries = [...runbook.matchAll(/psqlq "(SELECT [^"]+)"/g)].map((match) => match[1]!);
    const present = [...new Set(queries.filter((sql) => sql.includes('to_regprocedure(')))];
    expect(present).toEqual(["SELECT count(*) FROM pg_proc WHERE oid = to_regprocedure('staff.arm_rekey(uuid,text,text,text)')"]);
    expect(queries.filter((sql) => sql === present[0])).toHaveLength(3);
    expect((await database.pool.query(present[0]!)).rows[0].count).toBe('1');
    const admitted = [...new Set(queries.filter((sql) => sql.includes('pg_hba_file_rules')))];
    expect(admitted).toHaveLength(1);
    expect(queries.filter((sql) => sql === admitted[0])).toHaveLength(3);
    const rule = (await database.pool.query(admitted[0]!)).rows[0].coalesce as string;
    expect(typeof rule).toBe('string');
    expect(rule.length).toBeGreaterThan(0);
    // The tool is called with the sign-in code the script asked for.
    expect(runbook).toContain('lc rekey-staff-key.mjs arm-owner "$SC"');
  });

  it('gives no login the permit table, and each new function only its own caller', async () => {
    const table = (await database.pool.query(`SELECT r AS role,has_table_privilege(r,'staff.rekey_permit','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS any
      FROM unnest(ARRAY['debateai_runtime','debateai_rls_all_accounts','debateai_staff_recovery','debateai_prod_staff_recovery','rekey_test_runtime']) r`)).rows;
    expect(table.every((row) => row.any === false)).toBe(true);
    const grants = (await database.pool.query(`SELECT p.proname,
        has_function_privilege('debateai_runtime',p.oid,'EXECUTE') AS runtime,
        has_function_privilege('debateai_rls_all_accounts',p.oid,'EXECUTE') AS system,
        has_function_privilege('debateai_staff_recovery',p.oid,'EXECUTE') AS recovery,
        has_function_privilege('public',p.oid,'EXECUTE') AS everyone
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE (n.nspname='staff' AND p.proname IN('rekey_key_present','rekey_permit_current','arm_rekey','step_up_prerequisite_v2','rekey_challenge_current','begin_owned_webauthn_v2','read_owned_webauthn_challenge_v2','complete_owned_webauthn_registration_v2'))
         OR (n.nspname='identity' AND p.proname='staff_insert_rekey_webauthn_key') ORDER BY p.proname`)).rows;
    expect(grants).toEqual([
      { proname: 'arm_rekey', runtime: false, system: false, recovery: true, everyone: false },
      { proname: 'begin_owned_webauthn_v2', runtime: false, system: true, recovery: false, everyone: false },
      { proname: 'complete_owned_webauthn_registration_v2', runtime: false, system: true, recovery: false, everyone: false },
      { proname: 'read_owned_webauthn_challenge_v2', runtime: false, system: true, recovery: false, everyone: false },
      { proname: 'rekey_challenge_current', runtime: false, system: false, recovery: false, everyone: false },
      { proname: 'rekey_key_present', runtime: false, system: false, recovery: false, everyone: false },
      { proname: 'rekey_permit_current', runtime: false, system: false, recovery: false, everyone: false },
      { proname: 'staff_insert_rekey_webauthn_key', runtime: false, system: false, recovery: false, everyone: false },
      { proname: 'step_up_prerequisite_v2', runtime: true, system: false, recovery: false, everyone: false }
    ]);
  });
});
