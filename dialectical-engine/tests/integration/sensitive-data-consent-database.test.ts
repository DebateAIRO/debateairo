import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, PostgresSessionRepository } from "@debateai/db";
import type { AuditContextHasher } from "../../packages/crypto/src/index.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/* Sensitive-data consent (migration 0078) on real PostgreSQL: one row per account, written
   only from a live session the account owns, and the first agreement stands. */

let database: TestDatabase;
const source = Object.freeze({ ip: "192.0.2.18", userAgent: "Consent Browser", requestId: "request:sensitive-consent" });
const fakeAuditHasher = Object.freeze({
  hashSourceIp: async () => "11".repeat(32),
  hashUserAgent: async () => "22".repeat(32)
}) as unknown as AuditContextHasher;
const hash = (label: string) => `sha256:${createHash("sha256").update(`sensitive-consent:${label}`).digest("hex")}`;

async function activeUser(label: string): Promise<Readonly<{ userId: string; auditToken: string }>> {
  const userId = randomUUID();
  const auditToken = randomUUID();
  await database.pool.query(`
    INSERT INTO identity."user" (
      user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
      phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,adult_affirmed_at,created_at
    ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'$argon2id$v=19$m=65536,t=3,p=1$c2FsdA$AAAA',$3,$4,$5,'active',now(),now())
  `, [userId, createHash("sha256").update(`sensitive-consent:${label}:${userId}`).digest(), `sensitive-consent-${label}-${userId}`, auditToken, randomUUID()]);
  return { userId, auditToken };
}

async function liveSession(userId: string, label: string): Promise<string> {
  const sessionId = randomUUID();
  const now = new Date();
  await database.pool.query(`
    INSERT INTO identity.session (
      session_id,user_id,token_hash,csrf_token_hash,binding_context,
      created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at,revoked_at
    ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$6,$7,$8,$6,NULL)
  `, [sessionId, userId, hash(`${label}:token`), hash(`${label}:csrf`),
    JSON.stringify({ user_agent_hash: hash(`${label}:binding`) }), now,
    new Date(now.getTime() + 86_400_000), new Date(now.getTime() + 7 * 86_400_000)]);
  return sessionId;
}

const consentRow = async (userId: string) => (await database.pool.query(
  "SELECT notice_version,locale,consented_at FROM identity.sensitive_data_consent WHERE user_id=$1",
  [userId]
)).rows[0];

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);

afterAll(async () => database?.stop());

describe("sensitive-data consent on real PostgreSQL", () => {
  it("keeps only what was agreed to, in which language, and when", async () => {
    const columns = (await database.pool.query<{ column_name: string }>(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='identity' AND table_name='sensitive_data_consent' ORDER BY ordinal_position
    `)).rows.map((row) => row.column_name);
    expect(columns).toEqual(["user_id", "notice_version", "locale", "consented_at"]);
  });

  it("reads false, records from a live session, then reads true; a second agreement changes nothing", async () => {
    const repository = new PostgresSessionRepository(database.pool, fakeAuditHasher);
    const { userId } = await activeUser("agrees");
    const sessionId = await liveSession(userId, "agrees");
    expect(await repository.readSensitiveDataConsent(userId)).toBe(false);

    const first = new Date();
    expect(await repository.recordSensitiveDataConsent({
      userId, sessionId, noticeVersion: "2026-09-29", locale: "ro", occurredAt: first
    })).toBe("given");
    expect(await repository.readSensitiveDataConsent(userId)).toBe(true);

    expect(await repository.recordSensitiveDataConsent({
      userId, sessionId, noticeVersion: "2026-09-29", locale: "en", occurredAt: new Date(first.getTime() + 1000)
    })).toBe("given");
    const row = await consentRow(userId);
    expect(row.notice_version).toBe("2026-09-29");
    expect(row.locale).toBe("ro");
    expect(new Date(row.consented_at).getTime()).toBe(first.getTime());
  });

  it("refuses a session the account does not own, or one that was revoked, and writes nothing", async () => {
    const repository = new PostgresSessionRepository(database.pool, fakeAuditHasher);
    const { userId } = await activeUser("owner");
    const { userId: otherId } = await activeUser("other");
    const othersSession = await liveSession(otherId, "other");
    expect(await repository.recordSensitiveDataConsent({
      userId, sessionId: othersSession, noticeVersion: "2026-09-29", locale: "en", occurredAt: new Date()
    })).toBe("SESSION_NOT_FOUND");

    const revoked = await liveSession(userId, "revoked");
    await database.pool.query("UPDATE identity.session SET revoked_at=now() WHERE session_id=$1", [revoked]);
    expect(await repository.recordSensitiveDataConsent({
      userId, sessionId: revoked, noticeVersion: "2026-09-29", locale: "en", occurredAt: new Date()
    })).toBe("SESSION_NOT_FOUND");
    expect(await consentRow(userId)).toBeUndefined();
  });

  it("goes with the account when the account row is deleted", async () => {
    const repository = new PostgresSessionRepository(database.pool, fakeAuditHasher);
    const { userId } = await activeUser("erased");
    const sessionId = await liveSession(userId, "erased");
    await repository.recordSensitiveDataConsent({
      userId, sessionId, noticeVersion: "2026-09-29", locale: "en", occurredAt: new Date()
    });
    await database.pool.query("DELETE FROM identity.session WHERE user_id=$1", [userId]);
    await database.pool.query('DELETE FROM identity."user" WHERE user_id=$1', [userId]);
    expect(await consentRow(userId)).toBeUndefined();
  });
});
