import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  migrate,
  PostgresIdentityRepository,
  PostgresSessionRepository
} from "@debateai/db";
import { createEmailBlindIndex, encrypt, generateDek, type AuditContextHasher } from "../../packages/crypto/src/index.js";
import { AGE_RULE_VERSION, MIN_AGE } from "@debateai/kernel";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/* Age gate (migration 0077) on real PostgreSQL: the result-only record, the one-time
   confirmation, and the freeze. */

let database: TestDatabase;
const source = Object.freeze({ ip: "192.0.2.18", userAgent: "Age Gate Browser", requestId: "request:age-gate" });
const fakeAuditHasher = Object.freeze({
  hashSourceIp: async () => "11".repeat(32),
  hashUserAgent: async () => "22".repeat(32)
}) as unknown as AuditContextHasher;
const hash = (label: string) => `sha256:${createHash("sha256").update(`age-gate:${label}`).digest("hex")}`;

async function activeUser(label: string): Promise<Readonly<{ userId: string; auditToken: string }>> {
  const userId = randomUUID();
  const auditToken = randomUUID();
  await database.pool.query(`
    INSERT INTO identity."user" (
      user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
      phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,adult_affirmed_at,created_at
    ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'$argon2id$v=19$m=65536,t=3,p=1$c2FsdA$AAAA',$3,$4,$5,'active',now(),now())
  `, [userId, createHash("sha256").update(`age-gate:${label}:${userId}`).digest(), `age-gate-${label}-${userId}`, auditToken, randomUUID()]);
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

const ageRow = async (userId: string) => (await database.pool.query(
  "SELECT outcome,min_age_applied,country_code,rule_version,context FROM identity.age_check WHERE user_id=$1",
  [userId]
)).rows[0];
const userState = async (userId: string) => (await database.pool.query<{ state: string }>(
  'SELECT state FROM identity."user" WHERE user_id=$1', [userId]
)).rows[0]?.state;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);

afterAll(async () => database?.stop());

describe("age gate on real PostgreSQL", () => {
  it("stores the result and the rule, never the date", async () => {
    const columns = (await database.pool.query<{ column_name: string }>(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='identity' AND table_name='age_check' ORDER BY ordinal_position
    `)).rows.map((row) => row.column_name);
    expect(columns).toEqual(["user_id", "outcome", "min_age_applied", "country_code", "rule_version", "context", "checked_at"]);
  });

  it("records the passed check with the account at registration", async () => {
    const repository = new PostgresIdentityRepository(database.pool, fakeAuditHasher);
    const userId = randomUUID();
    const email = `age-gate-${userId}@example.test`;
    const keyId = `user-dek:${userId}`;
    const dek = generateDek();
    const created = await repository.createPendingAccount({
      userId,
      emailBlindIndex: createEmailBlindIndex(Buffer.alloc(32, 7), email),
      emailCiphertext: encrypt(dek, Buffer.from(email), ["identity", "user.email_ciphertext", userId, "run:none", userId, keyId, "1"]),
      recoveryEmailCiphertext: encrypt(dek, Buffer.from(`r-${email}`), ["identity", "user.recovery_email_ciphertext", userId, "run:none", userId, keyId, "1"]),
      passwordHash: "age-gate-password-hash",
      pseudonym: `age-gate-${userId}`,
      adultAffirmedAt: new Date("2026-09-28T00:00:00.000Z"),
      ageCheck: { minAgeApplied: MIN_AGE, countryCode: "RO", ruleVersion: AGE_RULE_VERSION },
      verificationTokenHash: hash(`${userId}:verification`),
      verificationExpiresAt: new Date("2026-09-29T00:00:00.000Z"),
      occurredAt: new Date("2026-09-28T00:00:00.000Z"),
      source
    }, async () => undefined);
    expect(created.status).toBe("created");
    expect(await ageRow(userId)).toEqual({
      outcome: "passed", min_age_applied: 18, country_code: "RO", rule_version: AGE_RULE_VERSION, context: "registration"
    });
  });

  it("asks an existing account once; a pass changes nothing else and cannot be re-answered", async () => {
    const repository = new PostgresSessionRepository(database.pool, fakeAuditHasher);
    const account = await activeUser("pass");
    const sessionId = await liveSession(account.userId, "pass");
    expect(await repository.readAgeCheckOutcome(account.userId)).toBe("required");
    const confirm = (passed: boolean) => repository.confirmAccountAge({
      userId: account.userId, sessionId, passed, minAgeApplied: MIN_AGE, countryCode: null,
      ruleVersion: AGE_RULE_VERSION, occurredAt: new Date(), source
    });
    expect(await confirm(true)).toBe("passed");
    expect(await repository.readAgeCheckOutcome(account.userId)).toBe("passed");
    expect(await ageRow(account.userId)).toMatchObject({ outcome: "passed", context: "existing_account" });
    // One-time: a later refusal answer does not overwrite the record or freeze the account.
    expect(await confirm(false)).toBe("passed");
    expect(await userState(account.userId)).toBe("active");
  });

  it("freezes on a refusal: every session is revoked and the account can no longer authenticate", async () => {
    const repository = new PostgresSessionRepository(database.pool, fakeAuditHasher);
    const account = await activeUser("refuse");
    const sessionId = await liveSession(account.userId, "refuse");
    await liveSession(account.userId, "refuse-other-device");
    const auditBefore = Number((await database.pool.query(
      "SELECT count(*) AS n FROM identity.audit_event WHERE event_type='identity.session.revoked_all'"
    )).rows[0].n);
    expect(await repository.confirmAccountAge({
      userId: account.userId, sessionId, passed: false, minAgeApplied: MIN_AGE, countryCode: null,
      ruleVersion: AGE_RULE_VERSION, occurredAt: new Date(), source
    })).toBe("refused");
    expect(await userState(account.userId)).toBe("age_frozen");
    expect(await ageRow(account.userId)).toMatchObject({ outcome: "refused", context: "existing_account" });
    const live = await database.pool.query(
      "SELECT count(*) AS n FROM identity.session WHERE user_id=$1 AND revoked_at IS NULL", [account.userId]
    );
    expect(Number(live.rows[0].n)).toBe(0);
    const auditAfter = Number((await database.pool.query(
      "SELECT count(*) AS n FROM identity.audit_event WHERE event_type='identity.session.revoked_all' AND success"
    )).rows[0].n);
    expect(auditAfter).toBeGreaterThan(auditBefore);
    expect(await repository.authenticateSession({
      tokenHash: hash("refuse:token"), bindingHash: hash("refuse:binding"),
      occurredAt: new Date(), idleExpiresAt: new Date(Date.now() + 86_400_000)
    })).toBeNull();
  });

  it("writes nothing for a session the account does not own", async () => {
    const repository = new PostgresSessionRepository(database.pool, fakeAuditHasher);
    const account = await activeUser("foreign");
    const stranger = await activeUser("stranger");
    const strangerSession = await liveSession(stranger.userId, "stranger");
    expect(await repository.confirmAccountAge({
      userId: account.userId, sessionId: strangerSession, passed: false, minAgeApplied: MIN_AGE,
      countryCode: null, ruleVersion: AGE_RULE_VERSION, occurredAt: new Date(), source
    })).toBe("SESSION_NOT_FOUND");
    expect(await ageRow(account.userId)).toBeUndefined();
    expect(await userState(account.userId)).toBe("active");
  });

  it("grants each function only to the principal that calls it", async () => {
    const can = async (role: string, fn: string) => (await database.pool.query<{ ok: boolean }>(
      "SELECT has_function_privilege($1,$2,'EXECUTE') AS ok", [role, fn]
    )).rows[0]!.ok;
    const record = "identity.record_registration_age_check(uuid,smallint,text,text,timestamptz)";
    const read = "identity.read_age_check_outcome(uuid)";
    const confirm = "identity.confirm_account_age_with_audit(uuid,uuid,boolean,smallint,text,text,timestamptz,jsonb)";
    expect(await can("debateai_runtime", record)).toBe(true);
    // (debateai_authorization_runtime inherits debateai_runtime since 0039, so it may call it too.)
    expect(await can("debateai_authorization_runtime", read)).toBe(true);
    expect(await can("debateai_authorization_runtime", confirm)).toBe(true);
    expect(await can("debateai_runtime", confirm)).toBe(false);
    expect(await can("public", confirm)).toBe(false);
  });

  it("goes with the account when the account is erased", async () => {
    const repository = new PostgresSessionRepository(database.pool, fakeAuditHasher);
    const account = await activeUser("erase");
    const sessionId = await liveSession(account.userId, "erase");
    await repository.confirmAccountAge({
      userId: account.userId, sessionId, passed: true, minAgeApplied: MIN_AGE, countryCode: null,
      ruleVersion: AGE_RULE_VERSION, occurredAt: new Date(), source
    });
    await database.pool.query('DELETE FROM identity."user" WHERE user_id=$1', [account.userId]);
    expect(await ageRow(account.userId)).toBeUndefined();
  });
});
