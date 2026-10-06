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
  await db.pool.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,verified_at) VALUES($1,$2,'totp',$3,'active',clock_timestamp())`, [factor, id, envelope]);
  return { id, index, envelope, channel, backup, factor, link: hash(), cancel: hash(), session: hash(), csrf: hash() };
}
async function start(a: Awaited<ReturnType<typeof account>>, register = 3) {
  return (await db.pool.query(`SELECT identity.password_reset_start($1,$2,$3,$4,$5,$6,$7,$8,$9) AS outcome`, [a.index, a.id, [a.channel, a.backup].sort(), box(a.id), a.link, a.cancel, JSON.stringify([a.channel, a.backup].sort().map(channelId => ({ channelId, envelope: box(a.id), ...(channelId === a.channel ? { proofEnvelope: box(a.id) } : {}) }))), source, register])).rows[0].outcome;
}
async function open(a: Awaited<ReturnType<typeof account>>) {
  expect(await start(a)).toBe(true);
  expect((await db.pool.query(`SELECT identity.password_reset_exchange($1,$2,$3,$4) AS outcome`, [a.link, a.session, a.csrf, source])).rows[0].outcome).toBe("PASSWORD_REQUIRED");
}
async function complete(a: Awaited<ReturnType<typeof account>>, step?: number, expectedLast: number | null = null, factor = a.factor, secret = a.envelope) {
  const dbStep = step ?? Number((await db.pool.query(`SELECT floor(extract(epoch FROM clock_timestamp())/30)::bigint AS step`)).rows[0].step);
  return (await db.pool.query(`SELECT identity.password_reset_complete($1,$2,$3,$4,$5,$6,$7) AS outcome`, [a.session, password, factor, secret, expectedLast, dbStep, source])).rows[0].outcome;
}
async function startCurrentRecovery(a:Awaited<ReturnType<typeof account>>,token=hash()){
 const client=await currentRecovery.connect();try{await client.query('BEGIN');await client.query('SELECT identity.begin_runtime_audit_attempt()');const result=(await client.query('SELECT identity.start_consumer_recovery($1,$2,$3) value',[a.index,token,source])).rows[0].value;await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
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
      await db.pool.query(`UPDATE identity.mfa_factor SET state='revoked',revoked_at=clock_timestamp() WHERE mfa_factor_id=$1`, [a.factor]);
    if (kind === "seed")
      await db.pool.query(`UPDATE identity.mfa_factor SET secret_ciphertext=$1 WHERE mfa_factor_id=$2`, [box(randomUUID()), a.factor]);
    expect(await complete(a)).toBe("INVALID");
  });
  it("refuses a newly selected active authenticator even if the old factor remains active", async () => {
    const a = await account();
    await open(a);
    await db.pool.query(`INSERT INTO identity.mfa_factor(user_id,factor_type,secret_ciphertext,state,verified_at) VALUES($1,'totp',$2,'active',clock_timestamp())`, [a.id, box(randomUUID())]);
    expect(await complete(a)).toBe("INVALID");
  });
  it("cancels only its own binding and permits the surviving current saved-code recovery start", async () => {
    const a = await account(), other = await account();
    await db.pool.query(`INSERT INTO identity.recovery_code(user_id,code_hash,code_slot) VALUES($1,'saved-code',1)`, [a.id]);
    await open(a);
    await open(other);
    expect((await db.pool.query(`SELECT identity.password_reset_cancel_session($1,$2) AS result`, [a.session, source])).rows[0].result).toBe("CANCELLED");
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
      await db.pool.query(`SELECT identity.password_reset_failure($1,$2)`, [a.session, source]);
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
});
