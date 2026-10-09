import { ConsumerSecurityNoticeReconciler } from '../../apps/api/src/consumer-security-notices.js';
import { PostgresConsumerSecurityNoticeRepository } from '@debateai/db';
import { renderAccountEmail } from '../../apps/api/src/account-mail-template.mjs';
import type {PoolClient} from "pg";
import { EmailChangeService } from "../../apps/api/src/email-change.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, migrate, PostgresAccountProfileRepository, PostgresRecoveryEmailRepository, PostgresSessionRepository, PostgresRecoveryStartRepository, PostgresEmailChangeRepository, accountRecoveryChannelRefsAad, type Pool } from "@debateai/db";
import { AccountProfileService } from "../../apps/api/src/account-profile.js";
import { RecoveryEmailService } from "../../apps/api/src/recovery-email.js";
import { MemoryRecoveryEmailMailSender, MemoryEmailChangeMailSender } from "../../apps/api/src/mail-channel.js";
import { createEmailBlindIndex, decrypt, encrypt, generateVerificationToken, hashToken } from "@debateai/crypto";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { profileAccount, profileGrant, profileAudit, profileUsers, profileKeys, profileBlindKey, profileSource, profileAad } from "../support/profileAccount.js";
let db: TestDatabase, auth: Pool, runtime: Pool;
beforeAll(async () => {
  db = await startTestDatabase();
  await migrate(db.pool);
  const url = new URL(db.connectionString);
  url.searchParams.set("options", "-c role=debateai_authorization_runtime");
  url.searchParams.set("application_name", "task3-authority");
  auth = createPool(url.toString());
  url.searchParams.set("options", "-c role=debateai_runtime");
  runtime = createPool(url.toString());
}, 120000);
afterAll(async () => {
  await auth?.end();
  await runtime?.end();
  await db?.stop();
  for (const k of profileKeys.values())
    k.fill(0);
  profileKeys.clear();
});
async function waitForSecurityWait(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if ((await db.pool.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='task3-authority' AND wait_event='advisory') AS waiting")).rows[0].waiting)
      return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error("TEST_SECURITY_WAIT_NOT_OBSERVED");
}
async function rollbackOpenTransactionAndRelease(client: PoolClient, transactionOpen: boolean): Promise<void> {
  try {
    if (transactionOpen) await client.query("ROLLBACK");
  } finally {
    client.release();
  }
}
const profile = () => new AccountProfileService({
  repository: new PostgresAccountProfileRepository(auth, profileAudit), users: profileUsers
});
function recovery() {
  const mail = new MemoryRecoveryEmailMailSender();
  return {
    mail, service: new RecoveryEmailService({
      repository: new PostgresRecoveryEmailRepository(auth, profileAudit), users: profileUsers, blindIndexKey: profileBlindKey, mail
    })
  };
}
it('masked reads audit before loading the DEK and fail closed for authorization or audit errors', async()=>{
 const a=await profileAccount(db.pool),b=await profileAccount(db.pool);let loads=0;
 const service=new AccountProfileService({repository:new PostgresAccountProfileRepository(auth,profileAudit),users:{...profileUsers,load:async(id:string)=>{loads++;const rows=(await db.pool.query("SELECT success FROM identity.audit_event WHERE actor_key_ref=(SELECT audit_token::text FROM identity.\"user\" WHERE user_id=$1) AND event_type='identity.phone_profile.READ_PHONE_PROFILE'",[id])).rows;expect(rows.some(r=>r.success)).toBe(true);return profileUsers.load(id);}}});
 expect(await service.phoneProfile({...a,sessionId:b.sessionId},profileSource)).toBeNull();expect(loads).toBe(0);
 await db.pool.query("CREATE FUNCTION identity.final_profile_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.event_type='identity.phone_profile.READ_PHONE_PROFILE' THEN RAISE EXCEPTION 'FINAL_PROFILE_AUDIT_FAIL';END IF;RETURN NEW;END$$");
 await db.pool.query('CREATE TRIGGER final_profile_audit_fail BEFORE INSERT ON identity.audit_event FOR EACH ROW EXECUTE FUNCTION identity.final_profile_audit_fail()');
 try{await expect(service.phoneProfile(a,profileSource)).rejects.toThrow('FINAL_PROFILE_AUDIT_FAIL');expect(loads).toBe(0);}finally{await db.pool.query('DROP TRIGGER final_profile_audit_fail ON identity.audit_event');await db.pool.query('DROP FUNCTION identity.final_profile_audit_fail()');}
 expect((await service.phoneProfile(a,profileSource))?.phone_present).toBe(true);expect(loads).toBe(1);
 const rows=(await db.pool.query("SELECT source_context FROM identity.audit_event WHERE actor_key_ref=(SELECT audit_token::text FROM identity.\"user\" WHERE user_id=$1) AND event_type='identity.phone_profile.READ_PHONE_PROFILE'",[a.userId])).rows;
 expect(JSON.stringify(rows)).not.toMatch(/phone|ciphertext|masked/);
});
it('recovery channel changes atomically enqueue only the verified primary notice, with replay and no-op removal excluded',async()=>{
 const a=await profileAccount(db.pool),{service,mail}=recovery();
 await db.pool.query('DELETE FROM identity.consumer_security_notice WHERE user_id=$1',[a.userId]);
 await service.requestRecoveryEmail(a,{email:'backup@example.test',grantToken:await profileGrant(db.pool,a,'CHANGE_RECOVERY_EMAIL')},profileSource);
 expect((await db.pool.query('SELECT * FROM identity.consumer_security_notice WHERE user_id=$1',[a.userId])).rows).toHaveLength(0);
 const token=mail.messages[0]!.token;
 await service.confirmRecoveryEmail({token},profileSource);
 const notices=async()=>(await db.pool.query('SELECT n.*,c.channel_type FROM identity.consumer_security_notice n JOIN identity.channel_binding c USING(channel_binding_id) WHERE n.user_id=$1',[a.userId])).rows;
 expect(await notices()).toMatchObject([{event_kind:'METHOD_CHANGED',channel_type:'email',revision:'1'}]);
 await expect(service.confirmRecoveryEmail({token},profileSource)).rejects.toThrow();expect((await notices())[0].revision).toBe('1');
 await service.removeRecoveryEmail(a,{grantToken:await profileGrant(db.pool,a,'CHANGE_RECOVERY_EMAIL')},profileSource);expect((await notices())[0].revision).toBe('2');
 await service.removeRecoveryEmail(a,{grantToken:await profileGrant(db.pool,a,'CHANGE_RECOVERY_EMAIL')},profileSource);expect((await notices())[0].revision).toBe('2');
 const delivered:string[]=[];
 const reconciler=new ConsumerSecurityNoticeReconciler(new PostgresConsumerSecurityNoticeRepository(auth),profileUsers,{sendConsumerSecurityNotice:async(message)=>{expect(message.recipient).toBe(a.email);expect(message.eventKind).toBe('METHOD_CHANGED');const mail=renderAccountEmail({template:'security-method-changed-v1',recipient:message.recipient,messageId:message.messageId,expiresAt:message.happenedAt});delivered.push(mail.text);}});
 // Other independently-created fixture accounts are excluded from this controlled run.
 await db.pool.query('DELETE FROM identity.consumer_security_notice WHERE user_id<>$1',[a.userId]);
 await reconciler.reconcile(1);expect(delivered).toHaveLength(1);expect(await notices()).toHaveLength(0);
});
it('recovery confirmation notice failure rolls back the channel and leaves the proof usable',async()=>{
 const a=await profileAccount(db.pool),{service,mail}=recovery();
 await service.requestRecoveryEmail(a,{email:'rollback-backup@example.test',grantToken:await profileGrant(db.pool,a,'CHANGE_RECOVERY_EMAIL')},profileSource);
 const token=mail.messages[0]!.token;
 await db.pool.query("CREATE FUNCTION identity.final_notice_fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'FINAL_NOTICE_FAIL';END$$");await db.pool.query('CREATE TRIGGER final_notice_fail BEFORE INSERT ON identity.consumer_security_notice FOR EACH ROW EXECUTE FUNCTION identity.final_notice_fail()');
 try{await expect(service.confirmRecoveryEmail({token},profileSource)).rejects.toThrow('FINAL_NOTICE_FAIL');}finally{await db.pool.query('DROP TRIGGER final_notice_fail ON identity.consumer_security_notice');await db.pool.query('DROP FUNCTION identity.final_notice_fail()');}
 expect((await service.recoveryEmail(a))?.state).toBe('pending');
 await service.confirmRecoveryEmail({token},profileSource);expect((await service.recoveryEmail(a))?.state).toBe('verified');
});
describe("0097 restricted profile and recovery capabilities", () => {
  it("reads masked phone, consumes a purpose-bound reveal once, and audits without values", async () => {
    const a = await profileAccount(db.pool);
    const s = profile();
    expect(await s.phoneProfile(a,profileSource)).toMatchObject({
      phone_present: true, phone_masked: "••••••••3456", phone_verified: false
    });
    const token = await profileGrant(db.pool, a, "READ_PHONE_PROFILE");
    expect(await s.revealPhoneProfile(a, token, profileSource)).toEqual({
      phone: "+40722123456", phone_verified: false
    });
    await expect(s.revealPhoneProfile(a, token, profileSource)).rejects.toMatchObject({
      code: "STEP_UP_REQUIRED"
    });
    const rows = (await db.pool.query("SELECT * FROM identity.audit_event WHERE event_type LIKE 'identity.phone_profile.%' ORDER BY occurred_at")).rows;
    expect(rows.some(r => r.event_type === "identity.phone_profile.READ_PHONE_PROFILE" && r.success)).toBe(true);
    expect(JSON.stringify(rows)).not.toContain("+40722123456");
  });
  it("rejects crossed account, session, stale and wrong-purpose grants without changing the profile", async () => {
    const a = await profileAccount(db.pool), b = await profileAccount(db.pool);
    const s = profile();
    for (const [owner, token] of [[b, await profileGrant(db.pool, a, "READ_PHONE_PROFILE")], [{
          ...a, sessionId: b.sessionId
        }, await profileGrant(db.pool, a, "READ_PHONE_PROFILE")], [a, await profileGrant(db.pool, a, "READ_PHONE_PROFILE", 301)],
      [a, await profileGrant(db.pool, a, "READ_PHONE_PROFILE", 60, -1)], [a, await profileGrant(db.pool, a, "CHANGE_PHONE_PROFILE")]] as const) {
      await expect(s.revealPhoneProfile(owner, token, profileSource)).rejects.toMatchObject({
        code: "STEP_UP_REQUIRED"
      });
    }
    await expect(s.updatePhoneProfile(a, {
      phone: "+40733123456", grantToken: await profileGrant(db.pool, a, "READ_PHONE_PROFILE")
    }, profileSource)).rejects.toMatchObject({
      code: "STEP_UP_REQUIRED"
    });
  });
  it("encrypts normalized changes and rejects rotated session tokens and held accounts", async () => {
    // The repository's has-phone read, called directly: the ask path no longer consults it
    // (owner ruling 2026-10-09), so AccountProfileService no longer forwards it.
    const a = await profileAccount(db.pool, null), s = profile(), repository = new PostgresAccountProfileRepository(auth, profileAudit);
    expect(await repository.hasPhone(a.ownerRef)).toBe(false);
    expect(await s.phoneProfile(a,profileSource)).toEqual({
      phone_present: false, phone_masked: null, phone_verified: false, updated_at: null
    });
    await s.updatePhoneProfile(a, {
      phone: "+40 733 123 456", grantToken: await profileGrant(db.pool, a, "CHANGE_PHONE_PROFILE")
    }, profileSource);
    expect(await repository.hasPhone(a.ownerRef)).toBe(true);
    const row = (await db.pool.query('SELECT phone_ciphertext,phone_source,phone_verification_status FROM identity."user" WHERE user_id=$1', [a.userId])).rows[0];
    expect(decrypt(profileKeys.get(a.userId)!, row.phone_ciphertext, profileAad(a.userId, "user.phone_ciphertext")).toString()).toBe("+40733123456");
    expect(row).toMatchObject({
      phone_source: "manual", phone_verification_status: "unverified"
    });
    const g = await profileGrant(db.pool, a, "READ_PHONE_PROFILE");
    await db.pool.query("UPDATE identity.session SET token_hash=$2 WHERE session_id=$1", [a.sessionId, hashToken("session", "r".repeat(43))]);
    await expect(s.revealPhoneProfile(a, g, profileSource)).rejects.toMatchObject({
      code: "STEP_UP_REQUIRED"
    });
    expect(await s.phoneProfile(a,profileSource)).toBeNull();
  });
  it("retains the verified recovery channel while a separately confirmed replacement is pending", async () => {
    const a = await profileAccount(db.pool, null, "old@example.test"), { service, mail } = recovery();
    await service.requestRecoveryEmail(a, {
      email: " New@Example.test ", grantToken: await profileGrant(db.pool, a, "CHANGE_RECOVERY_EMAIL")
    }, profileSource);
    expect(await service.recoveryEmail(a)).toMatchObject({
      state: "pending", email: "old@example.test", pending: {
        email: "new@example.test"
      }
    });
    const channels = (await db.pool.query("SELECT channel_type,state,address_ciphertext FROM identity.channel_binding WHERE user_id=$1", [a.userId])).rows;
    expect(channels.filter(r => r.channel_type === "recovery_email")).toHaveLength(1);
    expect(channels.find(r => r.channel_type === "recovery_email").state).toBe("verified");
    const token = mail.messages[0]!.token;
    const stored = (await db.pool.query("SELECT * FROM identity.recovery_email_request WHERE user_id=$1", [a.userId])).rows[0];
    expect(stored.confirm_token_hash).toBe(hashToken("recovery-email-confirm", token));
    expect(JSON.stringify(stored)).not.toContain(token);
    await service.confirmRecoveryEmail({
      token
    }, profileSource);
    expect(await service.recoveryEmail(a)).toEqual({
      state: "verified", email: "new@example.test", pending: null
    });
    const final = (await db.pool.query('SELECT recovery_email_ciphertext FROM identity."user" WHERE user_id=$1', [a.userId])).rows[0];
    expect(decrypt(profileKeys.get(a.userId)!, final.recovery_email_ciphertext, profileAad(a.userId, "user.recovery_email_ciphertext")).toString()).toBe("new@example.test");
    await expect(service.confirmRecoveryEmail({
      token
    }, profileSource)).rejects.toMatchObject({
      code: "LINK_INVALID"
    });
  });
  it("rejects primary email, wrong-purpose grants, expired links and superseded candidates", async () => {
    const a = await profileAccount(db.pool), { service, mail } = recovery();
    await expect(service.requestRecoveryEmail(a, {
      email: a.email, grantToken: await profileGrant(db.pool, a, "CHANGE_RECOVERY_EMAIL")
    }, profileSource)).rejects.toMatchObject({
      code: "EMAIL_UNCHANGED"
    });
    await expect(service.requestRecoveryEmail(a, {
      email: "new@example.test", grantToken: await profileGrant(db.pool, a, "CHANGE_PHONE_PROFILE")
    }, profileSource)).rejects.toMatchObject({
      code: "STEP_UP_REQUIRED"
    });
    await service.requestRecoveryEmail(a, {
      email: "first@example.test", grantToken: await profileGrant(db.pool, a, "CHANGE_RECOVERY_EMAIL")
    }, profileSource);
    await service.requestRecoveryEmail(a, {
      email: "second@example.test", grantToken: await profileGrant(db.pool, a, "CHANGE_RECOVERY_EMAIL")
    }, profileSource);
    await expect(service.confirmRecoveryEmail({
      token: mail.messages[0]!.token
    }, profileSource)).rejects.toMatchObject({
      code: "LINK_INVALID"
    });
    await db.pool.query("UPDATE identity.recovery_email_request SET expires_at=clock_timestamp()-interval '1 second' WHERE user_id=$1 AND closed_at IS NULL", [a.userId]);
    await expect(service.confirmRecoveryEmail({
      token: mail.messages[1]!.token
    }, profileSource)).rejects.toMatchObject({
      code: "LINK_EXPIRED"
    });
    expect(await service.recoveryEmail(a)).toEqual({
      state: "absent", email: null, pending: null
    });
  });
  it("removes optional recovery with its own grant and excludes unverified legacy channels from recovery", async () => {
    const a = await profileAccount(db.pool, null, "old@example.test"), { service } = recovery();
    await db.pool.query("UPDATE identity.channel_binding SET state='pending_verification',verified_at=NULL WHERE user_id=$1 AND channel_type='recovery_email'", [a.userId]);
    expect(await service.recoveryEmail(a)).toEqual({
      state: "absent", email: null, pending: null
    });
    const selected = (await runtime.query("SELECT * FROM identity.prepare_account_recovery_start($1)", [createEmailBlindIndex(profileBlindKey, a.email)])).rows[0];
    expect(selected.channel_binding_ids).toHaveLength(1);
    const recoveryStart = new PostgresRecoveryStartRepository(runtime, profileAudit, profileUsers);
    expect(await recoveryStart.start({
      emailBlindIndex: createEmailBlindIndex(profileBlindKey, a.email), source: profileSource
    })).toMatchObject({
      status: "created"
    });
    const refs = (await db.pool.query("SELECT channel_refs_ciphertext FROM identity.account_recovery_request r JOIN identity.account_recovery_binding b USING(recovery_request_id) WHERE b.user_id=$1", [a.userId])).rows[0].channel_refs_ciphertext;
    expect(JSON.parse(decrypt(profileKeys.get(a.userId)!, refs, accountRecoveryChannelRefsAad(a.userId)).toString())).toEqual({
      v: 1, channelBindingIds: selected.channel_binding_ids
    });
    await service.removeRecoveryEmail(a, {
      grantToken: await profileGrant(db.pool, a, "CHANGE_RECOVERY_EMAIL")
    }, profileSource);
    expect((await db.pool.query('SELECT recovery_email_ciphertext FROM identity."user" WHERE user_id=$1', [a.userId])).rows[0].recovery_email_ciphertext).toBeNull();
    expect((await db.pool.query("SELECT 1 FROM identity.channel_binding WHERE user_id=$1 AND channel_type='recovery_email'", [a.userId])).rows).toHaveLength(0);
  });
  it("rechecks the session after a security-lock wait expires it", async () => {
    const a = await profileAccount(db.pool), g = await profileGrant(db.pool, a, "READ_PHONE_PROFILE"), client = await db.pool.connect();
    let transactionOpen = false;
    try {
      await client.query("BEGIN");
      transactionOpen = true;
      await client.query("SELECT identity.lock_security_subjects(ARRAY[$1::uuid])", [a.userId]);
      const reveal = profile().revealPhoneProfile(a, g, profileSource);
      await waitForSecurityWait();
      await client.query("UPDATE identity.session SET created_at=clock_timestamp()-interval '2 minutes',last_seen_at=clock_timestamp()-interval '1 minute',idle_expires_at=clock_timestamp()-interval '1 second' WHERE session_id=$1", [a.sessionId]);
      await client.query("COMMIT");
      transactionOpen = false;
      await expect(reveal).rejects.toMatchObject({
        code: "STEP_UP_REQUIRED"
      });
    }
    finally {
      await rollbackOpenTransactionAndRelease(client, transactionOpen);
    }
  });
  it("denies profile reads and recovery confirmation after PREPARE and cascades ciphertext on erasure", async () => {
    const a = await profileAccount(db.pool), { service, mail } = recovery();
    await service.requestRecoveryEmail(a, {
      email: "candidate@example.test", grantToken: await profileGrant(db.pool, a, "CHANGE_RECOVERY_EMAIL")
    }, profileSource);
    const g = await profileGrant(db.pool, a, "READ_PHONE_PROFILE"), id = randomUUID();
    await db.pool.query("INSERT INTO identity.account_erasure_request(erasure_id,user_id,requested_at,execute_at) VALUES($1,$2,clock_timestamp()-interval '2 seconds',clock_timestamp()-interval '1 second')", [id, a.userId]);
    expect((await db.pool.query("SELECT identity.prepare_account_erasure($1,'{}'::uuid[],'{}'::uuid[],'{}'::uuid[]) AS outcome", [id])).rows[0].outcome).toBe("PREPARED");
    expect(await profile().phoneProfile(a,profileSource)).toBeNull();
    await expect(profile().revealPhoneProfile(a, g, profileSource)).rejects.toMatchObject({
      code: "STEP_UP_REQUIRED"
    });
    await expect(service.confirmRecoveryEmail({
      token: mail.messages[0]!.token
    }, profileSource)).rejects.toMatchObject({
      code: "LINK_INVALID"
    });
    await db.pool.query("UPDATE identity.account_erasure_notification_outbox SET claim_token=gen_random_uuid(),claim_expires_at=NULL,acknowledged_at=clock_timestamp(),last_error_code=NULL WHERE user_id=$1", [a.userId]);
    const client = await db.pool.connect();
    let transactionOpen = false;
    try {
      await client.query("BEGIN");
      transactionOpen = true;
      await client.query("SET LOCAL ROLE debateai_erasure_runtime");
      expect((await client.query("SELECT identity.finalize_account_erasure($1,clock_timestamp(),clock_timestamp(),0,0,1,0) AS outcome", [id])).rows[0].outcome).toBe("COMMITTED");
      await client.query("COMMIT");
      transactionOpen = false;
    }
    finally {
      await rollbackOpenTransactionAndRelease(client, transactionOpen);
    }
    await profileUsers.destroy(a.userId);
    await expect(profileUsers.load(a.userId)).rejects.toThrow("USER_DEK_UNRESOLVED");
    expect((await db.pool.query("SELECT 1 FROM identity.recovery_email_request WHERE user_id=$1", [a.userId])).rows).toHaveLength(0);
  });
  it("confirms after ordinary logout without creating a session or factor-reset grant", async () => {
    const a = await profileAccount(db.pool), { service, mail } = recovery();
    await service.requestRecoveryEmail(a, {
      email: "logout-confirm@example.test", grantToken: await profileGrant(db.pool, a, "CHANGE_RECOVERY_EMAIL")
    }, profileSource);
    await db.pool.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE session_id=$1", [a.sessionId]);
    const before = (await db.pool.query("SELECT count(*)::int AS count FROM identity.step_up_grant WHERE user_id=$1", [a.userId])).rows[0].count;
    await service.confirmRecoveryEmail({
      token: mail.messages[0]!.token
    }, profileSource);
    expect((await db.pool.query("SELECT state FROM identity.channel_binding WHERE user_id=$1 AND channel_type='recovery_email'", [a.userId])).rows[0].state).toBe("verified");
    expect((await db.pool.query("SELECT count(*)::int AS count FROM identity.session WHERE user_id=$1 AND revoked_at IS NULL", [a.userId])).rows[0].count).toBe(0);
    expect((await db.pool.query("SELECT count(*)::int AS count FROM identity.step_up_grant WHERE user_id=$1", [a.userId])).rows[0].count).toBe(before);
  });
  it("rechecks the current primary address after its lock wait and keeps the old verified recovery channel", async () => {
    const a = await profileAccount(db.pool, null, "old-recovery@example.test"), { service, mail } = recovery(), email = "became-primary@example.test";
    await service.requestRecoveryEmail(a, {
      email, grantToken: await profileGrant(db.pool, a, "CHANGE_RECOVERY_EMAIL")
    }, profileSource);
    const primaryMail = new MemoryEmailChangeMailSender(), primary = new EmailChangeService({
      repository: new PostgresEmailChangeRepository(auth, profileAudit), users: profileUsers, blindIndexKey: profileBlindKey, mail: primaryMail, tokenTtlMs: 86400000, resendCooldownMs: 60000
    });
    await primary.request(a, {
      newEmail: email, grantToken: await profileGrant(db.pool, a, "CHANGE_EMAIL")
    }, profileSource);
    const link = primaryMail.messages.find(message => message.kind === "confirmation");
    if (link?.kind !== "confirmation")
      throw new Error("TEST_PRIMARY_CONFIRMATION_MISSING");
    const client = await db.pool.connect();
    let transactionOpen = false;
    try {
      await client.query("BEGIN");
      transactionOpen = true;
      await client.query("SELECT identity.lock_security_subjects(ARRAY[$1::uuid])", [a.userId]);
      const confirm = service.confirmRecoveryEmail({
        token: mail.messages[0]!.token
      }, profileSource);
      await waitForSecurityWait();
      await client.query("SELECT identity.begin_runtime_audit_attempt()");
      expect((await client.query("SELECT identity.confirm_email_change_with_audit($1,$2::jsonb) AS outcome", [hashToken("email-change-confirm", link.token), JSON.stringify({
          ipArgon2id: `argon2id-audit:v1:${"33".repeat(32)}`, userAgentArgon2id: `argon2id-audit:v1:${"44".repeat(32)}`
        })])).rows[0].outcome).toBe("CONFIRMED");
      await client.query("COMMIT");
      transactionOpen = false;
      await expect(confirm).rejects.toMatchObject({
        code: "LINK_INVALID"
      });
    }
    finally {
      await rollbackOpenTransactionAndRelease(client, transactionOpen);
    }
    expect(await service.recoveryEmail(a)).toEqual({
      state: "verified", email: "old-recovery@example.test", pending: null
    });
  });
  it("denies confirmation after a security-hold race finishes ahead of its lock", async () => {
    const a = await profileAccount(db.pool), { service, mail } = recovery();
    await service.requestRecoveryEmail(a, {
      email: "held@example.test", grantToken: await profileGrant(db.pool, a, "CHANGE_RECOVERY_EMAIL")
    }, profileSource);
    const client = await db.pool.connect();
    let transactionOpen = false;
    try {
      await client.query("BEGIN");
      transactionOpen = true;
      await client.query("SELECT identity.lock_security_subjects(ARRAY[$1::uuid])", [a.userId]);
      const confirm = service.confirmRecoveryEmail({
        token: mail.messages[0]!.token
      }, profileSource);
      await waitForSecurityWait();
      await client.query("INSERT INTO identity.account_security_hold(user_id,held) VALUES($1,true) ON CONFLICT(user_id) DO UPDATE SET held=true", [a.userId]);
      await client.query("COMMIT");
      transactionOpen = false;
      await expect(confirm).rejects.toMatchObject({
        code: "LINK_INVALID"
      });
      expect(await profile().phoneProfile(a,profileSource)).toBeNull();
      expect((await db.pool.query("SELECT 1 FROM identity.channel_binding WHERE user_id=$1 AND channel_type='recovery_email'", [a.userId])).rows).toHaveLength(0);
    }
    finally {
      await rollbackOpenTransactionAndRelease(client, transactionOpen);
    }
  });
  it("rejects an old candidate whose confirmation waited while a replacement became current", async () => {
    const a = await profileAccount(db.pool), { service, mail } = recovery();
    await service.requestRecoveryEmail(a, {
      email: "first-race@example.test", grantToken: await profileGrant(db.pool, a, "CHANGE_RECOVERY_EMAIL")
    }, profileSource);
    const client = await db.pool.connect();
    let transactionOpen = false;
    try {
      await client.query("BEGIN");
      transactionOpen = true;
      await client.query("SELECT identity.lock_security_subjects(ARRAY[$1::uuid])", [a.userId]);
      const confirm = service.confirmRecoveryEmail({
        token: mail.messages[0]!.token
      }, profileSource);
      await waitForSecurityWait();
      // Invoke the real request capability on the lock-owning connection so the
      // replacement wins before the waiting confirmer obtains account authority.
      const grant = await profileGrant(db.pool, a, "CHANGE_RECOVERY_EMAIL");
      const cipher = encrypt(profileKeys.get(a.userId)!, Buffer.from("replacement-race@example.test"), profileAad(a.userId, "user.recovery_email_ciphertext"));
      await client.query("SELECT identity.begin_runtime_audit_attempt()");
      const nextToken = "n".repeat(43);
      expect((await client.query("SELECT identity.request_recovery_email_with_audit($1,$2,$3,$4,$5,$6,$7::jsonb,$8,clock_timestamp()+interval '23 hours',$9::jsonb) AS result", [a.userId, a.sessionId, a.tokenHash, hashToken("step-up-grant", grant), randomUUID(), createEmailBlindIndex(profileBlindKey, "replacement-race@example.test"), JSON.stringify(cipher), hashToken("recovery-email-confirm", nextToken), JSON.stringify({
          ipArgon2id: `argon2id-audit:v1:${"33".repeat(32)}`, userAgentArgon2id: `argon2id-audit:v1:${"44".repeat(32)}`
        })])).rows[0].result).toBe("PENDING");
      await client.query("COMMIT");
      transactionOpen = false;
      await expect(confirm).rejects.toMatchObject({
        code: "LINK_INVALID"
      });
      expect((await db.pool.query("SELECT 1 FROM identity.channel_binding WHERE user_id=$1 AND channel_type='recovery_email'", [a.userId])).rows).toHaveLength(0);
    }
    finally {
      await rollbackOpenTransactionAndRelease(client, transactionOpen);
    }
  });
  it("mints all three account-bound five-minute actions through production TOTP grant rotation", async () => {
    const repository = new PostgresSessionRepository(auth, profileAudit);
    for (const action of ["READ_PHONE_PROFILE", "CHANGE_PHONE_PROFILE", "CHANGE_RECOVERY_EMAIL"] as const) {
      const a = await profileAccount(db.pool), factorId = randomUUID(), secretCiphertext = encrypt(profileKeys.get(a.userId)!, Buffer.from("fixture-totp-secret"), profileAad(a.userId, "mfa_factor.secret_ciphertext"));
      await db.pool.query("INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,verified_at) VALUES($1,$2,'totp',$3::jsonb,'active',clock_timestamp())", [factorId, a.userId, JSON.stringify(secretCiphertext)]);
      const identity = (await db.pool.query('SELECT audit_token,password_hash FROM identity."user" WHERE user_id=$1', [a.userId])).rows[0], grantToken = generateVerificationToken(), grantId = randomUUID(), now = new Date(), replacementTokenHash = hashToken("session", generateVerificationToken());
      expect(await repository.rotateAfterStepUp({
        identity: {
          userId: a.userId, ownerRef: a.ownerRef, auditToken: identity.audit_token, passwordHash: identity.password_hash, factorId, secretCiphertext, lastAcceptedStep: null
        }, currentSessionId: a.sessionId, currentTokenHash: a.tokenHash, acceptedStep: 1, replacementTokenHash, replacementCsrfHash: hashToken("csrf", generateVerificationToken()), bindingContext: {}, occurredAt: now, idleExpiresAt: new Date(now.getTime() + 1209600000), source: profileSource, grant: {
          grantId, grantTokenHash: hashToken("step-up-grant", grantToken), action, expiresAt: new Date(now.getTime() + 300000)
        }
      })).toBe(true);
      const grant = (await db.pool.query("SELECT action,target_account_id,target_run_id,extract(epoch FROM (expires_at-issued_at)) AS ttl FROM identity.step_up_grant WHERE step_up_grant_id=$1", [grantId])).rows[0];
      expect(grant).toMatchObject({
        action, target_account_id: a.userId, target_run_id: null
      });
      expect(Number(grant.ttl)).toBeGreaterThan(299);
      expect(Number(grant.ttl)).toBeLessThanOrEqual(300);
      expect(await profile().phoneProfile(a,profileSource)).toBeNull();
      const current = {
        ...a, tokenHash: replacementTokenHash
      };
      if (action === "READ_PHONE_PROFILE")
        expect(await profile().revealPhoneProfile(current, grantToken, profileSource)).toMatchObject({
          phone: "+40722123456"
        });
      else if (action === "CHANGE_PHONE_PROFILE")
        expect(await profile().updatePhoneProfile(current, {
          phone: "+40733123456", grantToken
        }, profileSource)).toMatchObject({
          phone_present: true
        });
      else
        expect(await recovery().service.requestRecoveryEmail(current, {
          email: "rotated-recovery@example.test", grantToken
        }, profileSource)).toMatchObject({
          state: "pending"
        });
      expect((await db.pool.query("SELECT consumed_at IS NOT NULL AS consumed FROM identity.step_up_grant WHERE step_up_grant_id=$1", [grantId])).rows[0].consumed).toBe(true);
    }
  });
  it("refuses waiting phone reveal/change and mailed confirmation when PREPARE wins", async () => {
    const a = await profileAccount(db.pool), { service, mail } = recovery(), s = profile();
    await service.requestRecoveryEmail(a, {
      email: "erase-race@example.test", grantToken: await profileGrant(db.pool, a, "CHANGE_RECOVERY_EMAIL")
    }, profileSource);
    const read = await profileGrant(db.pool, a, "READ_PHONE_PROFILE"), change = await profileGrant(db.pool, a, "CHANGE_PHONE_PROFILE"), id = randomUUID(), client = await db.pool.connect();
    let transactionOpen = false;
    await db.pool.query("INSERT INTO identity.account_erasure_request(erasure_id,user_id,requested_at,execute_at) VALUES($1,$2,clock_timestamp()-interval '2 seconds',clock_timestamp()-interval '1 second')", [id, a.userId]);
    try {
      await client.query("BEGIN");
      transactionOpen = true;
      await client.query("SELECT identity.lock_security_subjects(ARRAY[$1::uuid])", [a.userId]);
      const outcomes = Promise.allSettled([s.revealPhoneProfile(a, read, profileSource), s.updatePhoneProfile(a, {
          phone: "+40733123456", grantToken: change
        }, profileSource), service.confirmRecoveryEmail({
          token: mail.messages[0]!.token
        }, profileSource)]);
      await waitForSecurityWait();
      expect((await client.query("SELECT identity.prepare_account_erasure($1,'{}'::uuid[],'{}'::uuid[],'{}'::uuid[]) AS outcome", [id])).rows[0].outcome).toBe("PREPARED");
      await client.query("COMMIT");
      transactionOpen = false;
      const results = await outcomes;
      expect(results.map(result => result.status)).toEqual(["rejected", "rejected", "rejected"]);
      expect(results.map(result => result.status === "rejected" ? result.reason.code : null)).toEqual(["STEP_UP_REQUIRED", "STEP_UP_REQUIRED", "LINK_INVALID"]);
      const cipher = (await db.pool.query('SELECT phone_ciphertext FROM identity."user" WHERE user_id=$1', [a.userId])).rows[0].phone_ciphertext;
      expect(decrypt(profileKeys.get(a.userId)!, cipher, profileAad(a.userId, "user.phone_ciphertext")).toString()).toBe("+40722123456");
    }
    finally {
      await rollbackOpenTransactionAndRelease(client, transactionOpen);
    }
  });
  it("grants only narrow capabilities and never exposes the new candidate table directly", async () => {
    expect((await auth.query("SELECT current_user AS role")).rows[0].role).toBe("debateai_authorization_runtime");
    for (const table of ['identity.recovery_email_request'])
      await expect(auth.query(`SELECT * FROM ${table}`)).rejects.toMatchObject({
        code: "42501"
      });
    for (const signature of ["identity.has_phone_profile(uuid)", "identity.read_phone_profile_with_audit(uuid,uuid,text,jsonb)", "identity.use_phone_profile_with_audit(uuid,uuid,text,text,text,jsonb,jsonb)", "identity.read_recovery_email(uuid,uuid,text)", "identity.request_recovery_email_with_audit(uuid,uuid,text,text,uuid,bytea,jsonb,text,timestamptz,jsonb)", "identity.confirm_recovery_email_with_audit(text,jsonb)", "identity.remove_recovery_email_with_audit(uuid,uuid,text,text,jsonb)"]) {
      expect((await db.pool.query("SELECT has_function_privilege('debateai_authorization_runtime',$1,'EXECUTE') AS ok", [signature])).rows[0].ok).toBe(true);
      const metadata = (await db.pool.query("SELECT prosecdef,proconfig,proowner=(SELECT proowner FROM pg_proc WHERE oid='identity.read_email_settings(uuid,uuid)'::regprocedure) AS same_owner FROM pg_proc WHERE oid=$1::regprocedure", [signature])).rows[0];
      expect(metadata.prosecdef).toBe(true);
      expect(metadata.same_owner).toBe(true);
      expect(metadata.proconfig).toContain("search_path=pg_catalog");
      for (const role of ["public", "debateai_runtime", "debateai_replay", "debateai_erasure_runtime", "debateai_staff_security_owner"])
        expect((await db.pool.query("SELECT has_function_privilege($1,$2,'EXECUTE') AS ok", [role, signature])).rows[0].ok).toBe(false);
    }
    for (const helper of ["identity.read_phone_profile(uuid,uuid,text)","identity.enqueue_recovery_method_notice_internal(uuid)","identity.consume_profile_grant_internal(uuid,uuid,text,text,text)", "identity.append_profile_audit_internal(uuid,text,jsonb,boolean)"]) {
      for (const role of ["public", "debateai_authorization_runtime", "debateai_runtime", "debateai_replay", "debateai_erasure_runtime", "debateai_staff_security_owner"])
        expect((await db.pool.query("SELECT has_function_privilege($1,$2,'EXECUTE') AS ok", [role, helper])).rows[0].ok).toBe(false);
    }
  });
});
