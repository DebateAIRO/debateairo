import { withMailLocale } from '../../packages/db/src/mail-locale.js';
import { randomUUID, createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encrypt, createEmailBlindIndex } from "@debateai/crypto";
import { migrate,createPool,type Pool } from "@debateai/db";
import { RECOVERY_POLICY_REGISTER_ROW } from "@debateai/register";
import { importHistoricalRegisterFixture, registerFixtureRow } from "../support/registerFixtures.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
// Removing any snapshot/replay/revocation check or admitting a nonordinary subject
// must change these externally visible database outcomes.
const policy = {
  kind: "PASSWORD_RESET_POLICY", policy_version: 1,
  proof: "VERIFIED_PRIMARY_EMAIL_AND_CURRENT_AUTHENTICATOR",
  preserve_factor: true, preserve_unused_recovery_codes: true,
  maximum_elapsed_ms: 1800000, proof_failures_per_attempt: 5,
  per_source_across_accounts: 20, source_window_ms: 300000,
  cleanup_batch_max: 1000, public_response: "ENUMERATION_RESISTANT_GENERIC",
  notification: "ALL_HISTORICALLY_BOUND_SUPPORTED_EMAIL_CHANNELS",
  primary_proof_only: true
};
let db: TestDatabase;
let currentRecovery:Pool;
const key = Buffer.alloc(32, 9), blind = Buffer.alloc(32, 17);
const hash = () => `sha256:${createHash("sha256").update(randomUUID()).digest("hex")}`;
const source = { ipArgon2id: `argon2id-audit:v1:${"1".repeat(64)}`, userAgentArgon2id: `argon2id-audit:v1:${"2".repeat(64)}` };
const password = `$argon2id$v=19$m=19456,t=2,p=1$${"A".repeat(22)}$${"B".repeat(43)}`;
function box(id: string) {
  return encrypt(key, Buffer.from("owned@example.test"), ["identity", "user.email_ciphertext", id, "run:none", id, `user-dek:${id}`, "1"]);
}
async function account() {
  const id = randomUUID(), index = createEmailBlindIndex(blind, `${id}@example.test`), envelope = box(id), channel = randomUUID(), backup = randomUUID(), factor = randomUUID();
  await db.pool.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at) VALUES($1,$2,$3,$3,'old-password-hash',$4,'active',clock_timestamp())`, [id, index, envelope, `reset-${id}`]);
  await db.pool.query(`INSERT INTO identity.channel_binding(channel_binding_id,user_id,channel_type,address_ciphertext,state,verified_at) VALUES($1,$3,'email',$4,'verified',clock_timestamp()),($2,$3,'recovery_email',$4,'verified',clock_timestamp())`, [channel, backup, id, envelope]);
  await withMailLocale(db.pool, 'en', (c) => c.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,verified_at) VALUES($1,$2,'totp',$3,'active',clock_timestamp())`, [factor, id, envelope]));
  return { id, index, envelope, channel, backup, factor, link: hash(), cancel: hash(), session: hash(), csrf: hash() };
}
async function start(a: Awaited<ReturnType<typeof account>>, register = 3) {
  return (await withMailLocale(db.pool, 'en', (c) => c.query(`SELECT identity.password_reset_start($1,$2,$3,$4,$5,$6,$7,$8,$9) AS outcome`, [a.index, a.id, [a.channel, a.backup].sort(), box(a.id), a.link, a.cancel, JSON.stringify([a.channel, a.backup].sort().map(channelId => ({ channelId, envelope: box(a.id), ...(channelId === a.channel ? { proofEnvelope: box(a.id) } : {}) }))), source, register]))).rows[0].outcome;
}
async function open(a: Awaited<ReturnType<typeof account>>) {
  expect(await start(a)).toBe(true);
  expect((await db.pool.query(`SELECT identity.password_reset_exchange($1,$2,$3,$4) AS outcome`, [a.link, a.session, a.csrf, source])).rows[0].outcome).toBe("PASSWORD_REQUIRED");
}
async function complete(a: Awaited<ReturnType<typeof account>>, step?: number, expectedLast: number | null = null, factor = a.factor, secret = a.envelope) {
  const dbStep = step ?? Number((await db.pool.query(`SELECT floor(extract(epoch FROM clock_timestamp())/30)::bigint AS step`)).rows[0].step);
  return (await withMailLocale(db.pool, 'en', (c) => c.query(`SELECT identity.password_reset_complete($1,$2,$3,$4,$5,$6,$7) AS outcome`, [a.session, password, factor, secret, expectedLast, dbStep, source]))).rows[0].outcome;
}
async function startCurrentRecovery(a:Awaited<ReturnType<typeof account>>,token=hash()){
 const client=await currentRecovery.connect();try{await client.query('BEGIN');await client.query('SELECT identity.begin_runtime_audit_attempt()');const result=(await client.query('SELECT identity.start_consumer_recovery($1,$2,$3) value',[a.index,token,source])).rows[0].value;await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
// NV-17: the new release's guarded entry points (0125). start/open/complete above stay the record of the 0104/0108 path.
type Reset = Awaited<ReturnType<typeof account>>;
async function startGuarded(a: Reset, from: typeof source = source) {
  return (await withMailLocale(db.pool, 'en', (c) => c.query(`SELECT identity.password_reset_start_guarded($1,$2,$3,$4,$5,$6,$7,$8,$9) AS outcome`, [a.index, a.id, [a.channel, a.backup].sort(), box(a.id), a.link, a.cancel, JSON.stringify([a.channel, a.backup].sort().map(channelId => ({ channelId, envelope: box(a.id), ...(channelId === a.channel ? { proofEnvelope: box(a.id) } : {}) }))), from, 3]))).rows[0].outcome;
}
async function openGuarded(a: Reset) {
  expect(await startGuarded(a)).toBe(true);
  expect((await db.pool.query(`SELECT identity.password_reset_exchange($1,$2,$3,$4) AS outcome`, [a.link, a.session, a.csrf, source])).rows[0].outcome).toBe("PASSWORD_REQUIRED");
}
async function reserve(a: Reset, lockMs: number | null = 300000) {
  return (await withMailLocale(db.pool, 'en', (c) => c.query(`SELECT identity.password_reset_proof_reserve($1,$2,$3) AS reserved`, [a.session, source, lockMs]))).rows[0].reserved;
}
async function refused(a: Reset) {
  await withMailLocale(db.pool, 'en', (c) => c.query(`SELECT identity.password_reset_proof_refused($1,$2)`, [a.session, source]));
}
async function completeGuarded(a: Reset) {
  const dbStep = Number((await db.pool.query(`SELECT floor(extract(epoch FROM clock_timestamp())/30)::bigint AS step`)).rows[0].step);
  return (await withMailLocale(db.pool, 'en', (c) => c.query(`SELECT identity.password_reset_complete_guarded($1,$2,$3,$4,$5,$6,$7) AS outcome`, [a.session, password, a.factor, a.envelope, null, dbStep, source]))).rows[0].outcome;
}
// A new attempt needs new link, cancel, session and csrf hashes: all four are UNIQUE on the control row (0104:17-19).
const renew = (a: Reset) => Object.assign(a, { link: hash(), cancel: hash(), session: hash(), csrf: hash() });
const counter = async (a: Reset) => (await db.pool.query(`SELECT attempts,locked_until IS NOT NULL AS locked,(extract(epoch FROM locked_until-clock_timestamp())*1000)::int AS remaining_ms FROM identity.password_reset_retry_lock WHERE user_id=$1`, [a.id])).rows[0];
const attempt = async (a: Reset) => (await db.pool.query(`SELECT stage,failures FROM identity.password_reset_control WHERE session_hash=$1`, [a.session])).rows[0];
const proofDenials = async (a: Reset) => (await db.pool.query(`SELECT count(*)::int AS n FROM identity.audit_event e JOIN identity.account_recovery_request r ON e.target_id=r.public_handle::text JOIN identity.password_reset_control c USING(recovery_request_id) WHERE c.session_hash=$1 AND e.event_type='identity.password_reset.proof' AND e.decision='DENY'`, [a.session])).rows[0].n;
beforeAll(async () => {
  db = await startTestDatabase();
  await migrate(db.pool);
  await db.pool.query("CREATE ROLE reset_general_fixture LOGIN PASSWORD 'reset-general-test-only' IN ROLE debateai_authorization_runtime");
  const url=new URL(db.connectionString);url.username="reset_general_fixture";url.password="reset-general-test-only";currentRecovery=createPool(url.toString());
  await importHistoricalRegisterFixture(db.pool, 4, [registerFixtureRow("recoveryPolicy", RECOVERY_POLICY_REGISTER_ROW.value, RECOVERY_POLICY_REGISTER_ROW.sourceRef)]);
  await importHistoricalRegisterFixture(db.pool, 3, [registerFixtureRow("passwordResetPolicy", policy, "approved-password-only-reset")]);
}, 120000);
afterAll(async () => {
  await currentRecovery?.end();await db?.stop();key.fill(0);blind.fill(0);
});
describe("ordinary password-only reset database authority", () => {
  it("admits a verified primary reset with a historically bound pending backup without granting backup proof",async()=>{
    const a=await account();await db.pool.query("UPDATE identity.channel_binding SET state='pending_verification',verified_at=NULL WHERE channel_binding_id=$1",[a.backup]);
    expect(await start(a)).toBe(true);
    expect((await db.pool.query("SELECT count(*)::int n FROM identity.password_reset_notice WHERE user_id=$1 AND channel_id=$2 AND event_kind='PROOF'",[a.id,a.backup])).rows[0].n).toBe(0);
    expect((await db.pool.query("SELECT count(*)::int n FROM identity.password_reset_notice WHERE user_id=$1 AND channel_id=$2 AND event_kind='PROOF'",[a.id,a.channel])).rows[0].n).toBe(1);
  });
  it("publishes a separate execution-only reset capability", async () => {
    const result = (await db.pool.query(`SELECT to_regprocedure('identity.password_reset_complete(text,text,uuid,jsonb,bigint,bigint,jsonb)') IS NOT NULL AS present`)).rows[0];
    expect(result.present).toBe(true);
  });
  it("requires an explicit sealed policy and does not require saved recovery codes", async () => {
    const a = await account();
    await expect(start(a, 4)).rejects.toThrow("PASSWORD_RESET_POLICY_UNRESOLVED");
    expect(await start(a)).toBe(true);
    expect((await db.pool.query(`SELECT count(*)::int AS n FROM identity.recovery_code WHERE user_id=$1`, [a.id])).rows[0].n).toBe(0);
  });
  it("atomically replaces only the password, retains factor and all unused codes, and revokes prior sessions/challenges/grants", async () => {
    const a = await account();
    await db.pool.query(`INSERT INTO identity.recovery_code(user_id,code_hash,code_slot) VALUES($1,'retained-code',1)`, [a.id]);
    const before = (await db.pool.query(`SELECT * FROM identity.recovery_code WHERE user_id=$1`, [a.id])).rows;
    const s = randomUUID();
    await db.pool.query(`INSERT INTO identity.session(session_id,user_id,token_hash,csrf_token_hash,last_mfa_at,idle_expires_at,absolute_expires_at) VALUES($1,$2,$3,$3,clock_timestamp(),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '1 day')`, [s, a.id, hash()]);
    await db.pool.query(`INSERT INTO identity.login_challenge(user_id,mfa_factor_id,token_hash,binding_hash,password_hash_snapshot,created_at,expires_at) VALUES($1,$2,$3,$3,'old-password-hash',clock_timestamp(),clock_timestamp()+interval '5 minutes')`, [a.id, a.factor, hash()]);
    await db.pool.query(`INSERT INTO identity.step_up_grant(user_id,session_id,token_hash,action,target_run_id,issued_at,expires_at) VALUES($1,$2,$3,'PUBLISH',$4,clock_timestamp(),clock_timestamp()+interval '5 minutes')`, [a.id, s, hash(), randomUUID()]);
    await open(a);
    const outcomes = await Promise.all([complete(a), complete(a)]);
    expect(outcomes.sort()).toEqual(["COMPLETED", "INVALID"]);
    expect((await db.pool.query(`SELECT password_hash FROM identity."user" WHERE user_id=$1`, [a.id])).rows[0].password_hash).toBe(password);
    expect((await db.pool.query(`SELECT mfa_factor_id,secret_ciphertext,state,last_accepted_step IS NOT NULL AS advanced FROM identity.mfa_factor WHERE user_id=$1`, [a.id])).rows).toEqual([{ mfa_factor_id: a.factor, secret_ciphertext: a.envelope, state: "active", advanced: true }]);
    expect((await db.pool.query(`SELECT * FROM identity.recovery_code WHERE user_id=$1`, [a.id])).rows).toEqual(before);
    expect((await db.pool.query(`SELECT revoked_at IS NOT NULL AS revoked FROM identity.session WHERE session_id=$1`, [s])).rows[0].revoked).toBe(true);
    expect((await db.pool.query(`SELECT bool_and(consumed_at IS NOT NULL) AS consumed FROM identity.login_challenge WHERE user_id=$1`, [a.id])).rows[0].consumed).toBe(true);
    expect((await db.pool.query(`SELECT bool_and(consumed_at IS NOT NULL) AS consumed FROM identity.step_up_grant WHERE user_id=$1`, [a.id])).rows[0].consumed).toBe(true);
    expect((await db.pool.query(`SELECT channel_id FROM identity.password_reset_notice WHERE user_id=$1 AND event_kind='COMPLETED' ORDER BY channel_id`, [a.id])).rows.map(r => r.channel_id)).toEqual([a.channel, a.backup].sort());
    expect((await db.pool.query(`SELECT identity.password_reset_read($1) AS receipt`, [a.session])).rows[0].receipt).toMatchObject({ stage: "COMPLETED" });
  });
  it("rejects email-link replay, cross-flow tokens and TOTP steps already consumed by normal login", async () => {
    const a = await account();
    await open(a);
    expect((await db.pool.query(`SELECT identity.password_reset_exchange($1,$2,$3,$4) AS outcome`, [a.link, hash(), hash(), source])).rows[0].outcome).toBe("INVALID");
    expect((await currentRecovery.query(`SELECT identity.read_consumer_recovery_proof($1,NULL) AS record`, [a.session])).rows[0].record).toBeNull();
    await expect(currentRecovery.query(`SELECT identity.password_recovery_read($1)`,[a.session])).rejects.toMatchObject({code:"42501"});
    const step = Number((await db.pool.query(`SELECT floor(extract(epoch FROM clock_timestamp())/30)::bigint AS step`)).rows[0].step);
    await db.pool.query(`UPDATE identity.mfa_factor SET last_accepted_step=$1 WHERE mfa_factor_id=$2`, [step, a.factor]);
    expect(await complete(a, step, null)).toBe("INVALID");
    expect(await complete(a, step, step)).toBe("INVALID");
  });
  it.each(["staff", "hold", "erasure", "email", "email-index", "password", "epoch", "factor", "seed"])("rechecks %s transitions before completion", async (kind) => {
    const a = await account();
    await open(a);
    if (kind === "staff")
      await db.pool.query(`INSERT INTO staff.subject(user_id,state) VALUES($1,'DISABLED')`, [a.id]);
    if (kind === "hold")
      await db.pool.query(`INSERT INTO identity.account_security_hold(user_id,held) VALUES($1,true)`, [a.id]);
    if (kind === "erasure")
      await db.pool.query(`INSERT INTO identity.account_erasure_request(user_id,requested_at,execute_at) VALUES($1,clock_timestamp(),clock_timestamp()+interval '1 day')`, [a.id]);
    if (kind === "epoch")
      await db.pool.query(`INSERT INTO identity.account_security_hold(user_id,held,security_epoch) VALUES($1,false,9)`, [a.id]);
    if (kind === "email")
      await db.pool.query(`UPDATE identity."user" SET email_ciphertext=$1 WHERE user_id=$2`, [box(randomUUID()), a.id]);
    if (kind === "email-index")
      await db.pool.query(`UPDATE identity."user" SET email_blind_index=$1 WHERE user_id=$2`, [createEmailBlindIndex(blind, `${randomUUID()}@example.test`), a.id]);
    if (kind === "password")
      await db.pool.query(`UPDATE identity."user" SET password_hash='other-password' WHERE user_id=$1`, [a.id]);
    if (kind === "factor")
      await withMailLocale(db.pool, 'en', (c) => c.query(`UPDATE identity.mfa_factor SET state='revoked',revoked_at=clock_timestamp() WHERE mfa_factor_id=$1`, [a.factor]));
    if (kind === "seed")
      await db.pool.query(`UPDATE identity.mfa_factor SET secret_ciphertext=$1 WHERE mfa_factor_id=$2`, [box(randomUUID()), a.factor]);
    expect(await complete(a)).toBe("INVALID");
  });
  it("refuses a newly selected active authenticator even if the old factor remains active", async () => {
    const a = await account();
    await open(a);
    await withMailLocale(db.pool, 'en', (c) => c.query(`INSERT INTO identity.mfa_factor(user_id,factor_type,secret_ciphertext,state,verified_at) VALUES($1,'totp',$2,'active',clock_timestamp())`, [a.id, box(randomUUID())]));
    expect(await complete(a)).toBe("INVALID");
  });
  it("cancels only its own binding and permits the surviving current saved-code recovery start", async () => {
    const a = await account(), other = await account();
    await db.pool.query(`INSERT INTO identity.recovery_code(user_id,code_hash,code_slot) VALUES($1,'saved-code',1)`, [a.id]);
    await open(a);
    await open(other);
    expect((await withMailLocale(db.pool, 'en', (c) => c.query(`SELECT identity.password_reset_cancel_session($1,$2) AS result`, [a.session, source]))).rows[0].result).toBe("CANCELLED");
    expect((await db.pool.query(`SELECT identity.password_reset_read($1) AS receipt`, [a.session])).rows[0].receipt).toMatchObject({ stage: "CANCELLED" });
    expect((await db.pool.query(`SELECT identity.password_reset_read($1) AS receipt`, [other.session])).rows[0].receipt).toMatchObject({ stage: "PASSWORD_REQUIRED" });
    expect(await startCurrentRecovery(a)).toMatchObject({userId:a.id});
    expect((await db.pool.query(`SELECT identity.password_reset_cancel($1,$2) AS result`, [other.link, source])).rows[0].result).toBe("INVALID");
  });
  it("serializes current recovery-token admission with the canonical reset subject lock without minting paired authority",async()=>{
    const a=await account();await db.pool.query(`INSERT INTO identity.recovery_code(user_id,code_hash,code_slot) VALUES($1,'saved-code',1)`,[a.id]);await open(a);
    const lock=await db.pool.connect();let transactionOpen=false;let pending:Promise<unknown>|undefined;
    try{
      await lock.query('BEGIN');transactionOpen=true;
      await lock.query('SELECT identity.lock_security_subjects($1)',[[a.id]]);pending=startCurrentRecovery(a);
      let blocked=false;for(let i=0;i<100;i++){if((await db.pool.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename='reset_general_fixture' AND wait_event_type='Lock' AND query LIKE '%start_consumer_recovery%') waiting")).rows[0].waiting){blocked=true;break;}await new Promise(r=>setTimeout(r,10));}expect(blocked).toBe(true);
      await lock.query('COMMIT');transactionOpen=false;expect(await pending).toMatchObject({userId:a.id});
      expect((await db.pool.query('SELECT count(*)::int n FROM identity.consumer_recovery_gate WHERE user_id=$1 AND active',[a.id])).rows[0].n).toBe(0);
      expect((await db.pool.query('SELECT identity.password_reset_read($1) receipt',[a.session])).rows[0].receipt).toMatchObject({stage:'PASSWORD_REQUIRED'});
    }finally{try{if(transactionOpen)await lock.query('ROLLBACK');}finally{lock.release();await pending;}}
  });
  it("rechecks expiry after waiting for the shared subject lock", async () => {
    const a = await account();
    await open(a);
    const lock = await db.pool.connect();
    let transactionOpen = false;
    let pending: Promise<unknown> | undefined;
    try {
      await lock.query("BEGIN");
      transactionOpen = true;
      await lock.query(`SELECT identity.lock_security_subjects($1)`, [[a.id]]);
      await lock.query(`UPDATE identity.password_reset_control SET expires_at=clock_timestamp()+interval '300 milliseconds' WHERE user_id=$1`, [a.id]);
      pending = complete(a);
      await new Promise(r => setTimeout(r, 100));
      expect((await db.pool.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%password_reset_complete%'`)).rows[0].n).toBeGreaterThan(0);
      await new Promise(r => setTimeout(r, 250));
      await lock.query("COMMIT");
      transactionOpen = false;
      expect(await pending).toBe("INVALID");
    }
    finally {
      try {
        if (transactionOpen) await lock.query("ROLLBACK");
      } finally {
        lock.release();
        await pending;
      }
    }
    expect((await db.pool.query(`SELECT password_hash FROM identity."user" WHERE user_id=$1`, [a.id])).rows[0].password_hash).toBe("old-password-hash");
  });
  it("limits proof/source work durably without locking the account merely for requesting a reset", async () => {
    const a = await account();
    await open(a);
    for (let i = 0; i < 5; i++)
      await withMailLocale(db.pool, 'en', (c) => c.query(`SELECT identity.password_reset_failure($1,$2)`, [a.session, source]));
    expect(await complete(a)).toBe("INVALID");
    a.link = hash();
    a.cancel = hash();
    expect(await start(a)).toBe(true);
    const spray = { ...source, ipArgon2id: `argon2id-audit:v1:${"a".repeat(64)}` };
    for (let i = 0; i < 20; i++)
      expect((await db.pool.query(`SELECT identity.password_reset_admit($1,3) AS ok`, [spray])).rows[0].ok).toBe(true);
    expect((await db.pool.query(`SELECT identity.password_reset_admit($1,3) AS ok`, [spray])).rows[0].ok).toBe(false);
  });
  it("does not discard a refreshed source window while cleanup waits for source admission", async () => {
    const refresh = { ...source, ipArgon2id: `argon2id-audit:v1:${"c".repeat(64)}` };
    await db.pool.query(`INSERT INTO identity.password_reset_source_window(source_digest,window_started_at,uses) VALUES($1,clock_timestamp()-interval '6 minutes',20)`, [refresh.ipArgon2id]);
    const lock = await db.pool.connect();
    let transactionOpen = false;
    let pending: Promise<unknown> | undefined;
    try {
      await lock.query("BEGIN");
      transactionOpen = true;
      await lock.query(`SELECT pg_advisory_xact_lock(hashtextextended('password-reset:source:'||$1,0))`, [refresh.ipArgon2id]);
      pending = db.pool.query(`SELECT identity.expire_password_reset(100)`);
      await new Promise(r => setTimeout(r, 100));
      expect((await db.pool.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%expire_password_reset%'`)).rows[0].n).toBeGreaterThan(0);
      expect((await lock.query(`SELECT identity.password_reset_admit($1,3) AS allowed`, [refresh])).rows[0].allowed).toBe(true);
      await lock.query("COMMIT");
      transactionOpen = false;
      await pending;
      expect((await db.pool.query(`SELECT uses FROM identity.password_reset_source_window WHERE source_digest=$1`, [refresh.ipArgon2id])).rows).toEqual([{ uses: 1 }]);
    }
    finally {
      try {
        if (transactionOpen) await lock.query("ROLLBACK");
      } finally {
        lock.release();
        await pending;
      }
    }
  });
  it("NV-17: a correct fifth code still completes, and the completed reset deletes the account's counter", async () => {
    const a = await account();
    await openGuarded(a);
    for (let i = 0; i < 4; i++) {
      expect(await reserve(a)).toMatchObject({ status: "READY" });
      await refused(a);
    }
    expect(await attempt(a)).toEqual({ stage: "PASSWORD_REQUIRED", failures: 4 });
    const fifth = await reserve(a);
    expect(fifth).toMatchObject({ status: "READY", userId: a.id, factorId: a.factor, factorSecret: a.envelope, lastAcceptedStep: null });
    expect(typeof fifth.nowMs).toBe("number");
    expect(await counter(a)).toMatchObject({ attempts: 5, locked: true });
    expect(await completeGuarded(a)).toBe("COMPLETED");
    expect(await attempt(a)).toMatchObject({ stage: "COMPLETED" });
    expect(await counter(a)).toBeUndefined();
  });
  it("NV-17: cancelling keeps the account's count; the fifth reservation locks new starts for 300 s, and the next round for 600 s", async () => {
    const a = await account();
    const eligible = async () => (await db.pool.query(`SELECT identity.mfa_recovery_eligible($1) AS ok`, [a.id])).rows[0].ok;
    const signals = async () => (await db.pool.query(`SELECT count(*)::int AS n FROM identity.authentication_risk_signal WHERE user_id=$1`, [a.id])).rows[0].n;
    const recoverable = await eligible();
    await openGuarded(a);
    for (let i = 0; i < 3; i++) {
      expect(await reserve(a)).toMatchObject({ status: "READY" });
      await refused(a);
    }
    expect((await withMailLocale(db.pool, 'en', (c) => c.query(`SELECT identity.password_reset_cancel_session($1,$2) AS result`, [a.session, source]))).rows[0].result).toBe("CANCELLED");
    renew(a);
    await openGuarded(a);
    expect(await reserve(a)).toMatchObject({ status: "READY" });
    expect(await counter(a)).toMatchObject({ attempts: 4, locked: false });
    expect(await reserve(a)).toMatchObject({ status: "READY" });
    const first = await counter(a);
    expect(first).toMatchObject({ attempts: 5, locked: true });
    expect(first.remaining_ms).toBeGreaterThan(290000);
    expect(first.remaining_ms).toBeLessThanOrEqual(300000);
    await refused(a);
    expect(await attempt(a)).toEqual({ stage: "REFUSED", failures: 2 });
    renew(a);
    const denied = { ...source, ipArgon2id: `argon2id-audit:v1:${"d".repeat(64)}` };
    const denials = async () => (await db.pool.query(`SELECT count(*)::int AS n FROM identity.audit_event WHERE event_type='identity.password_reset.started' AND decision='DENY' AND source_context->>'ipArgon2id'=$1`, [denied.ipArgon2id])).rows[0].n;
    expect(await startGuarded(a, denied)).toBe(false);
    expect(await denials()).toBe(1);
    expect((await db.pool.query(`SELECT count(*)::int AS n FROM identity.password_reset_control WHERE user_id=$1`, [a.id])).rows[0].n).toBe(2);
    expect(await eligible()).toBe(recoverable);
    expect(await signals()).toBe(0);
    // The clock cannot be advanced, so the lapse is written: no lock is permanent.
    await db.pool.query(`UPDATE identity.password_reset_retry_lock SET locked_until=clock_timestamp()-interval '1 second' WHERE user_id=$1`, [a.id]);
    await openGuarded(a);
    for (let i = 0; i < 5; i++)
      expect(await reserve(a)).toMatchObject({ status: "READY" });
    const second = await counter(a);
    expect(second).toMatchObject({ attempts: 10, locked: true });
    expect(second.remaining_ms).toBeGreaterThan(590000);
    expect(second.remaining_ms).toBeLessThanOrEqual(600000);
  });
  it("NV-17: twelve concurrent reservations admit exactly five; a refused one closes nothing and the settle closes", async () => {
    const a = await account();
    await openGuarded(a);
    const outcomes = await Promise.all(Array.from({ length: 12 }, () => reserve(a)));
    expect(outcomes.filter(o => o.status === "READY")).toHaveLength(5);
    expect(outcomes.filter(o => o.status === "REFUSED")).toHaveLength(7);
    const row = await counter(a);
    expect(row).toMatchObject({ attempts: 5, locked: true });
    expect(row.remaining_ms).toBeGreaterThan(0);
    expect(await attempt(a)).toEqual({ stage: "PASSWORD_REQUIRED", failures: 5 });
    expect(await proofDenials(a)).toBe(7);
    await refused(a);
    expect(await attempt(a)).toEqual({ stage: "REFUSED", failures: 5 });
    expect(await proofDenials(a)).toBe(8);
  });
  it.each([null, 59999, 3600001])("NV-17: refuses a cooldown base of %s ms before it counts anything", async (lockMs) => {
    const a = await account();
    await openGuarded(a);
    await expect(reserve(a, lockMs)).rejects.toThrow("PASSWORD_RESET_LOCK_INVALID");
    expect(await attempt(a)).toEqual({ stage: "PASSWORD_REQUIRED", failures: 0 });
    expect(await counter(a)).toBeUndefined();
  });
  it("NV-17: the counter and the four entry points belong to the reset owner, and only the reset runtime may execute them", async () => {
    const functions = ["identity.password_reset_start_guarded(bytea,uuid,uuid[],jsonb,text,text,jsonb,jsonb,bigint)", "identity.password_reset_proof_reserve(text,jsonb,bigint)", "identity.password_reset_proof_refused(text,jsonb)", "identity.password_reset_complete_guarded(text,text,uuid,jsonb,bigint,bigint,jsonb)"];
    const rows = (await db.pool.query(`SELECT signature,pg_get_userbyid(p.proowner)::text AS owner,p.prosecdef AS definer,p.provolatile::text AS volatility,
      has_function_privilege('debateai_password_reset_runtime',p.oid,'EXECUTE') AS reset_runtime,
      EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0) AS public_execute,
      has_function_privilege('debateai_runtime',p.oid,'EXECUTE') AS api_runtime,
      has_function_privilege('debateai_authorization_runtime',p.oid,'EXECUTE') AS authorization_runtime
      FROM unnest($1::text[]) signature JOIN pg_proc p ON p.oid=to_regprocedure(signature) ORDER BY signature`, [functions])).rows;
    expect(rows).toEqual([...functions].sort().map(signature => ({ signature, owner: "debateai_password_reset_owner", definer: true, volatility: "v", reset_runtime: true, public_execute: false, api_runtime: false, authorization_runtime: false })));
    const table = (await db.pool.query(`SELECT pg_get_userbyid(c.relowner)::text AS owner,
      (SELECT array_agg(DISTINCT pg_get_userbyid(a.grantee)::text) FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a) AS grantees,
      EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=c.oid AND t.tgname='reject_truncate' AND NOT t.tgisinternal) AS truncate_guard
      FROM pg_class c WHERE c.oid=to_regclass('identity.password_reset_retry_lock')`)).rows;
    expect(table).toEqual([{ owner: "debateai_password_reset_owner", grantees: ["debateai_password_reset_owner"], truncate_guard: true }]);
  });
  // NV-39: the window starts empty and holds exactly 65,536 rows in a strict eviction order: E (expired), then L (budget
  // left, uses 1), then the fillers (uses 2), with S (spent) last. One admit gives up 64 rows and takes the new digest.
  it("NV-39: at capacity the evicting admit gives up 64 rows, expired first and the spent one last; v1 still refuses", async () => {
    const digest = (seed: string) => `argon2id-audit:v1:${createHash("sha256").update(seed).digest("hex")}`, [E, L, S] = ["nv39-e", "nv39-l", "nv39-s"].map(digest);
    const count = async () => (await db.pool.query(`SELECT count(*)::int AS n FROM identity.password_reset_source_window`)).rows[0].n;
    const present = async () => (await db.pool.query(`SELECT source_digest FROM identity.password_reset_source_window WHERE source_digest=ANY($1::text[]) ORDER BY 1`, [[E, L, S]])).rows.map(r => r.source_digest);
    try {
      await db.pool.query(`DELETE FROM identity.password_reset_source_window`);
      await db.pool.query(`INSERT INTO identity.password_reset_source_window(source_digest,window_started_at,uses) VALUES($1,now()-interval '1 hour',1),($2,now()-interval '1 second',1),($3,now(),21)`, [E, L, S]);
      await db.pool.query(`INSERT INTO identity.password_reset_source_window(source_digest,window_started_at,uses) SELECT 'argon2id-audit:v1:'||encode(sha256(('w'||g)::text::bytea),'hex'),now(),2 FROM generate_series(1,65533) g`);
      expect(await count()).toBe(65536);
      expect((await db.pool.query(`SELECT identity.password_reset_admit_evicting($1,3) AS ok`, [{ ...source, ipArgon2id: digest("nv39-new") }])).rows[0].ok).toBe(true);
      expect(await present()).toEqual([S]);
      expect(await count()).toBe(65536 - 64 + 1);
      await db.pool.query(`INSERT INTO identity.password_reset_source_window(source_digest,window_started_at,uses) SELECT 'argon2id-audit:v1:'||encode(sha256(('v'||g)::text::bytea),'hex'),now(),2 FROM generate_series(1,63) g`);
      expect(await count()).toBe(65536);
      // The release before keeps the v1 admit, which still refuses a new digest at capacity.
      expect((await db.pool.query(`SELECT identity.password_reset_admit($1,3) AS ok`, [{ ...source, ipArgon2id: digest("nv39-v1") }])).rows[0].ok).toBe(false);
    }
    finally {
      await db.pool.query(`DELETE FROM identity.password_reset_source_window`);
    }
    const roles = ["debateai_password_reset_runtime", "debateai_mfa_recovery_runtime", "debateai_backup_email_runtime", "debateai_runtime", "debateai_authorization_runtime", "debateai_billing_runtime"];
    expect((await db.pool.query(`SELECT p.prosecdef AS definer,p.proconfig AS config,pg_get_userbyid(p.proowner)::text AS owner,
      EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0) AS public_execute,
      ARRAY(SELECT DISTINCT pg_get_userbyid(a.grantee)::text FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee NOT IN(0,p.proowner) ORDER BY 1) AS grantees,
      ARRAY(SELECT r FROM unnest($2::text[]) r WHERE has_function_privilege(r,p.oid,'EXECUTE') ORDER BY 1) AS executors
      FROM pg_proc p WHERE p.oid=to_regprocedure($1)`, ["identity.password_reset_admit_evicting(jsonb,bigint)", roles])).rows)
      .toEqual([{ definer: true, config: ["search_path=pg_catalog, pg_temp"], owner: "debateai_password_reset_owner", public_execute: false, grantees: ["debateai_password_reset_runtime"], executors: ["debateai_password_reset_runtime"] }]);
  });
});
