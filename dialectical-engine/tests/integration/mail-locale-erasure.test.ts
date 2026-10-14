import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { encrypt, generateDek, type AuditContextHasher, type ReadableUserDekStore } from "@debateai/crypto";
import { migrate, PostgresAccountErasureRepository } from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { AccountErasureNotificationReconciler } from "../../apps/api/src/account-erasure.js";
import type { SecurityNotificationMail } from "../../apps/api/src/mail-channel.js";

/**
 * Mission email-locale, S01-C11 (SPEC-v4 R-13, R-16; D-3 rows 10 to 12; D-96, D-108; V-23). The account-erasure family takes its
 * language from the request that caused it: the SCHEDULED row from the schedule request, the CANCELLED row from the cancel
 * request, the COMPLETION row from the SCHEDULED row (set by the erasure worker before prepare_account_erasure), and the worker
 * sends each row in the language stored on it.
 */

let db: TestDatabase;
let repository: PostgresAccountErasureRepository;
beforeAll(async () => {
  db = await startTestDatabase();
  await migrate(db.pool);
  repository = new PostgresAccountErasureRepository(db.pool, {} as AuditContextHasher);
}, 300_000);
afterAll(async () => { await db?.stop(); });

const deks = new Map<string, Buffer>();
const users: ReadableUserDekStore = {
  async store(userId, dek) { deks.set(userId, Buffer.from(dek)); },
  async load(userId) {
    const dek = deks.get(userId);
    if (dek === undefined) throw new Error("USER_DEK_MISSING");
    return Buffer.from(dek);
  },
  async exists(userId) { return deks.has(userId); },
  async destroy() { throw new Error("NOT_USED_IN_THIS_TEST"); }
};

function source(mailLocale: string) {
  return { ip: "203.0.113.7", userAgent: "mail-locale-erasure-test", requestId: randomUUID(), mailLocale };
}

/** A user with a verified email and a verified recovery address, both encrypted under the user's DEK, and a live session. */
async function fixtureUser(): Promise<Readonly<{ userId: string; ownerRef: string; sessionId: string; primary: string; recovery: string }>> {
  const userId = randomUUID();
  const ownerRef = randomUUID();
  const sessionId = randomUUID();
  const primary = `mail-locale-${randomUUID()}@example.test`;
  const recovery = `mail-locale-recovery-${randomUUID()}@example.test`;
  const dek = generateDek();
  const keyId = `user-dek:${userId}`;
  const envelope = (field: "user.email_ciphertext" | "user.recovery_email_ciphertext", value: string) =>
    encrypt(dek, Buffer.from(value, "utf8"), ["identity", field, userId, "run:none", userId, keyId, "1"]);
  const primaryEnvelope = envelope("user.email_ciphertext", primary);
  const recoveryEnvelope = envelope("user.recovery_email_ciphertext", recovery);
  await users.store(userId, dek);
  dek.fill(0);
  // Raw seed writes standing in for a sign-up; the channel rows queue no mail, so no carrier is needed for them.
  await db.pool.query(`
    INSERT INTO identity."user"(
      user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
      phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
      adult_affirmed_at,created_at
    ) VALUES ($1,$2,$3::jsonb,$4::jsonb,NULL,'test-password-hash',$5,$6,$7,
      'active',clock_timestamp(),clock_timestamp())`,
  [userId, randomBytes(32), JSON.stringify(primaryEnvelope), JSON.stringify(recoveryEnvelope),
    `mail-locale-${randomUUID()}`, randomUUID(), ownerRef]);
  await db.pool.query(`
    INSERT INTO identity.session(
      session_id,user_id,token_hash,csrf_token_hash,binding_context,
      created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at
    ) VALUES ($1,$2,$3,$4,$5::jsonb,clock_timestamp(),clock_timestamp(),
      clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours',clock_timestamp())`,
  [sessionId, userId, `sha256:${randomBytes(32).toString("hex")}`, `sha256:${randomBytes(32).toString("hex")}`,
    JSON.stringify({ user_agent_hash: `sha256:${randomBytes(32).toString("hex")}` })]);
  await db.pool.query(`
    INSERT INTO identity.channel_binding(
      channel_binding_id,user_id,channel_type,address_ciphertext,state,created_at,verified_at
    ) VALUES
      ($1,$3,'email',$4::jsonb,'verified',clock_timestamp(),clock_timestamp()),
      ($2,$3,'recovery_email',$5::jsonb,'verified',clock_timestamp(),clock_timestamp())`,
  [randomUUID(), randomUUID(), userId, JSON.stringify(primaryEnvelope), JSON.stringify(recoveryEnvelope)]);
  return Object.freeze({ userId, ownerRef, sessionId, primary, recovery });
}

async function stepUpGrant(user: Readonly<{ userId: string; sessionId: string }>): Promise<string> {
  const token = `sha256:${randomBytes(32).toString("hex")}`;
  await db.pool.query(`
    INSERT INTO identity.step_up_grant(
      step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,
      target_account_id,issued_at,expires_at,consumed_at
    ) VALUES ($1,$2,$3,$4,'DELETE_ACCOUNT',NULL,$4,clock_timestamp(),
      clock_timestamp()+interval '10 minutes',NULL)`,
  [randomUUID(), token, user.sessionId, user.userId]);
  return token;
}

async function scheduleFor(user: Readonly<{ userId: string; ownerRef: string; sessionId: string }>, mailLocale: string) {
  const scheduled = await repository.schedule({
    userId: user.userId, ownerRef: user.ownerRef, sessionId: user.sessionId,
    grantTokenHash: await stepUpGrant(user), source: source(mailLocale)
  });
  if (scheduled === null || scheduled.erasureId === undefined) throw new Error("SCHEDULE_RETURNED_NULL");
  return scheduled;
}

async function distinctLocales(erasureId: string, eventKind: string): Promise<string[]> {
  const rows = (await db.pool.query<{ mail_locale: string }>(`
    SELECT DISTINCT mail_locale FROM identity.account_erasure_notification_outbox
    WHERE erasure_id=$1 AND event_kind=$2 ORDER BY mail_locale`, [erasureId, eventKind])).rows;
  return rows.map((row) => row.mail_locale);
}

it("C11.1: a schedule request from ro stores ro in the SCHEDULED row of both channels", async () => {
  const user = await fixtureUser();
  const scheduled = await scheduleFor(user, "ro");
  expect(await distinctLocales(scheduled.erasureId, "SCHEDULED")).toEqual(["ro"]);
});

it("V-23: a schedule request that carries no language writes en in the SCHEDULED row", async () => {
  const user = await fixtureUser();
  const scheduled = await repository.schedule({
    userId: user.userId, ownerRef: user.ownerRef, sessionId: user.sessionId,
    grantTokenHash: await stepUpGrant(user)
  });
  if (scheduled === null) throw new Error("SCHEDULE_RETURNED_NULL");
  expect(await distinctLocales(scheduled.erasureId, "SCHEDULED")).toEqual(["en"]);
});

it("C11.2: a cancel request from pl stores pl in the CANCELLED row", async () => {
  const user = await fixtureUser();
  const scheduled = await scheduleFor(user, "ro");
  const cancelled = await repository.cancelCurrent({
    userId: user.userId, ownerRef: user.ownerRef, sessionId: user.sessionId,
    cancellationRef: scheduled.cancellationRef, source: source("pl")
  });
  expect(cancelled).toBe(true);
  expect(await distinctLocales(scheduled.erasureId, "CANCELLED")).toEqual(["pl"]);
});

it("C11.3: the COMPLETION row takes the SCHEDULED row's value (ro scheduled, ro completion; the completion request has no source)", async () => {
  const user = await fixtureUser();
  const scheduled = await scheduleFor(user, "ro");
  // The grace period has run out: prepare_account_erasure answers NOT_DUE before execute_at (0110:487).
  await db.pool.query("UPDATE identity.account_erasure_request SET requested_at=clock_timestamp()-interval '2 seconds',execute_at=clock_timestamp()-interval '1 second' WHERE erasure_id=$1", [scheduled.erasureId]);
  expect(await repository.prepare(scheduled.erasureId, [], [], [])).toBe("PREPARED");
  expect(await distinctLocales(scheduled.erasureId, "COMPLETION")).toEqual(["ro"]);
});

it("C11.6: a completion whose erasure has no SCHEDULED row is refused with MAIL_LOCALE_MISSING and writes nothing", async () => {
  const user = await fixtureUser();
  const erasureId = randomUUID();
  await db.pool.query(`
    INSERT INTO identity.account_erasure_request(erasure_id,user_id,requested_at,execute_at)
    VALUES ($1,$2,clock_timestamp()-interval '2 seconds',clock_timestamp()-interval '1 second')`,
  [erasureId, user.userId]);
  await expect(repository.prepare(erasureId, [], [], [])).rejects.toThrow("MAIL_LOCALE_MISSING");
  expect(await distinctLocales(erasureId, "COMPLETION")).toEqual([]);
});

it("C11.4: the worker sends a SCHEDULED row stored ro in ro, and a CANCELLED row stored pl in pl", async () => {
  const scheduledUser = await fixtureUser();
  await scheduleFor(scheduledUser, "ro");
  const cancelledUser = await fixtureUser();
  const cancelledSchedule = await scheduleFor(cancelledUser, "en");
  expect(await repository.cancelCurrent({
    userId: cancelledUser.userId, ownerRef: cancelledUser.ownerRef, sessionId: cancelledUser.sessionId,
    cancellationRef: cancelledSchedule.cancellationRef, source: source("pl")
  })).toBe(true);

  const sent: SecurityNotificationMail[] = [];
  const reconciler = new AccountErasureNotificationReconciler(repository, users, {
    async sendSecurityNotification(mail) { sent.push(mail); }
  });
  await reconciler.reconcile(100);

  const scheduledMail = sent.find((mail) => mail.recipient === scheduledUser.primary && mail.eventKind === "SCHEDULED");
  expect(scheduledMail?.display?.locale).toBe("ro");
  const cancelledMail = sent.find((mail) => mail.recipient === cancelledUser.primary && mail.eventKind === "CANCELLED");
  expect(cancelledMail?.display?.locale).toBe("pl");
});
