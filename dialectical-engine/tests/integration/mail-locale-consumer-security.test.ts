import { randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, migrate, PostgresConsumerSecurityNoticeRepository, PostgresConsumerSecurityRepository, PostgresIdentityRepository, PostgresSessionRepository, runInRequestScope, type Pool } from "@debateai/db";
import { createEmailBlindIndex, encrypt, hashToken, type AuditContextHasher } from "@debateai/crypto";
import { ConsumerSecurityNoticeReconciler } from "../../apps/api/src/consumer-security-notices.js";
import type { ConsumerSecurityNoticeSender } from "../../apps/api/src/mail-channel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { createSystemTwin } from "../support/rls-logins.js";

/**
 * Mission email-locale, S01-C07 (R-13, R-14; D-1 row 1, D-2 row 2, D-4 row 18; D-56 and D-57). A consumer-security writer
 * stores the mail language of its request (the transaction setting, carried by the repository's audited wrapper) on the
 * notice row it writes, and the consumer-security worker sends that stored language. A request that carries no language
 * is resolved to `en` (R-08).
 */
let database: TestDatabase;
let runtime: Pool;
// Row-level security (0126; D28, D29): the authorization pool as main.ts wires it. Inside a request it runs on its own
// login with that request's account context; outside one, or inside a crossAccount frame (X18a), on its system twin.
let runtimeSystem: Pool, scopedRuntime: Pool;
const audit = { hashSourceIp: async () => "ab".repeat(32), hashUserAgent: async () => "cd".repeat(32) } as unknown as AuditContextHasher;
const blindKey = Buffer.alloc(32, 7);
const fixturePasswordHash = "$argon2id$v=19$m=65536,t=3,p=1$" + Buffer.alloc(16, 1).toString("base64").replace(/=/g, "") + "$" + Buffer.alloc(32, 1).toString("base64").replace(/=/g, "");
const token = () => randomBytes(32).toString("base64url");
const argon2Hash = () => "$argon2id$v=19$m=65536,t=3,p=1$" + token().slice(0, 22) + "$" + token().slice(0, 43);
const deks = new Map<string, Buffer>();

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  await database.pool.query("CREATE ROLE mail_locale_test_runtime LOGIN PASSWORD 'mail-locale-test-only' IN ROLE debateai_authorization_runtime");
  const url = new URL(database.connectionString);
  url.username = "mail_locale_test_runtime";
  url.password = "mail-locale-test-only";
  runtime = createPool(url.toString());
  runtimeSystem = createPool(await createSystemTwin(database, "mail_locale_test_runtime_system", ["debateai_authorization_runtime"]));
  scopedRuntime = createPool(url.toString(), { crossAccount: runtimeSystem });
}, 300_000);
afterAll(async () => {
  await scopedRuntime?.end();
  await runtimeSystem?.end();
  await runtime?.end();
  await database?.stop();
});

/**
 * Fixture writes that fire the notice triggers (0100:591-603) need a language like any other queue writer. The fixture
 * runs them in one transaction that sets en. Each test asserts only the event kind it drives, so a fixture row never
 * stands in for the writer under test.
 */
async function fixture(run: (client: PoolClient) => Promise<void>): Promise<void> {
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('debateai.mail_locale', 'en', true)");
    await run(client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** An account with one verified email channel (a real envelope, so the worker can decrypt it), a session and two passkeys. */
async function account() {
  const userId = randomUUID(), sessionId = randomUUID(), sessionToken = token(), email = `mail-locale-${userId}@example.test`, dek = randomBytes(32);
  const cipher = encrypt(dek, Buffer.from(email), ["identity", "user.email_ciphertext", userId, "run:none", userId, `user-dek:${userId}`, "1"]);
  deks.set(userId, dek);
  const factors = [randomUUID(), randomUUID()];
  await fixture(async (client) => {
    await client.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at) VALUES($1::uuid,$2,$3,$4,$1::text,'active',now())`, [userId, createEmailBlindIndex(blindKey, email), cipher, fixturePasswordHash]);
    await client.query(`INSERT INTO identity.channel_binding(channel_binding_id,user_id,channel_type,address_ciphertext,state,created_at,verified_at) VALUES($1,$2,'email',$3,'verified',now(),now())`, [randomUUID(), userId, cipher]);
    await client.query(`INSERT INTO identity.session(session_id,user_id,token_hash,csrf_token_hash,binding_context,created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at) VALUES($1,$2,$3,$4,'{}',now(),now(),now()+interval '336 hours',now()+interval '720 hours',now())`, [sessionId, userId, hashToken("session", sessionToken), hashToken("csrf", token())]);
    await client.query(`INSERT INTO identity.consumer_passkey_subject VALUES($1,$2)`, [userId, token()]);
    for (const id of factors)
      await client.query(`INSERT INTO identity.consumer_passkey_credential(consumer_credential_id,user_id,credential_id,public_key,signature_counter,device_type,backed_up,rp_id,origin) VALUES($1,$2,$3,'AQID',0,'multiDevice',true,'example.test','https://example.test')`, [id, userId, token()]);
  });
  return { userId, email, factors, session: { userId, sessionId, tokenHash: hashToken("session", sessionToken) } };
}

/** A step-up grant the consumer-security function consumes (the raw token is hashed the way the API hashes it). */
async function grant(a: Awaited<ReturnType<typeof account>>, action: "REMOVE_AUTH_METHOD" | "REGENERATE_RECOVERY_CODES", factorId: string | null = null) {
  const value = token();
  await database.pool.query(`INSERT INTO identity.step_up_grant(step_up_grant_id,token_hash,session_id,user_id,action,target_account_id,target_factor_id,issued_at,expires_at) VALUES($1,$2,$3,$4,$5,$4,$6,statement_timestamp(),statement_timestamp()+interval '5 minutes')`, [randomUUID(), hashToken("step-up-grant", value), a.session.sessionId, a.userId, action, factorId]);
  return hashToken("step-up-grant", value);
}

/** The stored language of one event kind's notice row for an account (the row's own column, not a profile). */
async function languageOf(userId: string, eventKind: string): Promise<string | null> {
  const rows = (await database.pool.query<{ mail_locale: string }>("SELECT mail_locale FROM identity.consumer_security_notice WHERE user_id=$1 AND event_kind=$2", [userId, eventKind])).rows;
  expect(rows.length).toBeLessThanOrEqual(1);
  return rows[0]?.mail_locale ?? null;
}

const PASSWORD = { passwordHashSnapshot: fixturePasswordHash, passwordUsable: true };

describe("S01-C07 consumer-security writers and worker (R-13, R-14)", () => {
  it("C07.1: removing an auth method from a ro request stores ro on the METHOD_CHANGED row", async () => {
    const a = await account();
    const repository = new PostgresConsumerSecurityRepository(runtime, audit);
    await repository.removeAuthMethod(a.session, a.factors[0]!, await grant(a, "REMOVE_AUTH_METHOD", a.factors[0]!), PASSWORD, { ip: "198.51.100.10", userAgent: "mail-locale-test", requestId: randomUUID(), mailLocale: "ro" });
    expect((await database.pool.query("SELECT count(*)::int n FROM identity.consumer_passkey_credential WHERE user_id=$1 AND revoked_at IS NULL", [a.userId])).rows[0]!.n).toBe(1);
    expect(await languageOf(a.userId, "METHOD_CHANGED")).toBe("ro");
  });

  it("C07.2: regenerating recovery codes from a ro request stores ro; a request with no language stores en (R-08)", async () => {
    const withLanguage = await account();
    await new PostgresConsumerSecurityRepository(runtime, audit).regenerateRecoveryCodes(withLanguage.session, await grant(withLanguage, "REGENERATE_RECOVERY_CODES"), Array.from({ length: 10 }, argon2Hash), { ip: "198.51.100.11", userAgent: "mail-locale-test", requestId: randomUUID(), mailLocale: "ro" });
    expect(await languageOf(withLanguage.userId, "CODES_REGENERATED")).toBe("ro");

    const withoutLanguage = await account();
    await new PostgresConsumerSecurityRepository(runtime, audit).regenerateRecoveryCodes(withoutLanguage.session, await grant(withoutLanguage, "REGENERATE_RECOVERY_CODES"), Array.from({ length: 10 }, argon2Hash), { ip: "198.51.100.12", userAgent: "mail-locale-test", requestId: randomUUID() });
    expect(await languageOf(withoutLanguage.userId, "CODES_REGENERATED")).toBe("en");
  });

  it("C07.4: consuming a saved recovery code from a pl request stores pl on the RECOVERY_CODE_USED row", async () => {
    const a = await account();
    const recoveryCodeId = randomUUID();
    // The consume function counts a code only for an account with an active TOTP factor (0112:582-587); that INSERT fires
    // the METHOD_CHANGED trigger too, so it runs in the fixture transaction.
    await fixture(async (client) => {
      await client.query("INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,created_at,verified_at) VALUES($1,$2,'totp','{}','active',now(),now())", [randomUUID(), a.userId]);
      await client.query("INSERT INTO identity.recovery_code(recovery_code_id,user_id,code_slot,code_hash,created_at) VALUES($1,$2,1,$3,now())", [recoveryCodeId, a.userId, argon2Hash()]);
    });
    const consumed = await new PostgresIdentityRepository(runtime, audit).consumeRecoveryCode({ userId: a.userId, recoveryCodeId, occurredAt: new Date(), source: { ip: "198.51.100.15", userAgent: "mail-locale-test", requestId: randomUUID(), mailLocale: "pl" } });
    expect(consumed).toBe(true);
    expect(await languageOf(a.userId, "RECOVERY_CODE_USED")).toBe("pl");
  });

  it("C07.5: a recovery-code login from a pl request stores pl on the RECOVERY_CODE_USED row", async () => {
    const a = await account();
    const recoveryCodeId = randomUUID();
    await fixture(async (client) => {
      await client.query("INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,created_at,verified_at) VALUES($1,$2,'totp','{}','active',now(),now())", [randomUUID(), a.userId]);
      await client.query("INSERT INTO identity.recovery_code(recovery_code_id,user_id,code_slot,code_hash,created_at) VALUES($1,$2,1,$3,now())", [recoveryCodeId, a.userId, argon2Hash()]);
    });
    // The sign-in's two requests run as the API runs them: before any session exists, on the wired authorization pool, so
    // the saved-code lookup (X18a) reads on the system twin. The bare login with no account context reads no saved code.
    const repository = new PostgresSessionRepository(scopedRuntime, audit);
    const identity = await runInRequestScope(() => repository.findLoginIdentity(createEmailBlindIndex(blindKey, a.email)));
    expect(identity?.userId).toBe(a.userId);
    const challengeToken = token(), bindingHash = "sha256:" + "ef".repeat(32);
    const challengeTokenHash = hashToken("login-challenge", challengeToken);
    const expiresAt = new Date(Date.now() + 5 * 60_000);
    const source = { ip: "198.51.100.16", userAgent: "mail-locale-test", requestId: randomUUID(), mailLocale: "pl" };
    expect(await runInRequestScope(() => repository.createLoginChallenge({ identity: identity!, challengeId: randomUUID(), challengeTokenHash, bindingHash, occurredAt: new Date(), expiresAt, source }))).toBe(true);
    expect(await new PostgresSessionRepository(runtime, audit).readRecoveryCodeForLogin(challengeTokenHash, 1)).toBeNull();
    const sessionId = randomUUID(), sessionToken = token();
    const idleExpiresAt = new Date(Date.now() + 60 * 60_000), absoluteExpiresAt = new Date(Date.now() + 12 * 60 * 60_000);
    const completed = await runInRequestScope(async () => {
      const found = await repository.readRecoveryCodeForLogin(challengeTokenHash, 1);
      expect(found).not.toBeNull();
      return repository.completeRecoveryLogin({ challenge: found!.challenge, recoveryCodeId: found!.recoveryCodeId, bindingHash, sessionId, sessionTokenHash: hashToken("session", sessionToken), csrfTokenHash: hashToken("csrf", token()), sessionBindingContext: {}, occurredAt: new Date(), idleExpiresAt, absoluteExpiresAt, source });
    });
    expect(completed).toBe(true);
    expect(await languageOf(a.userId, "RECOVERY_CODE_USED")).toBe("pl");
  });

  it("C07.7: the consumer-security worker sends each notice in the language stored on its row, not a profile language", async () => {
    const ro = await account();
    await new PostgresConsumerSecurityRepository(runtime, audit).removeAuthMethod(ro.session, ro.factors[0]!, await grant(ro, "REMOVE_AUTH_METHOD", ro.factors[0]!), PASSWORD, { ip: "198.51.100.13", userAgent: "mail-locale-test", requestId: randomUUID(), mailLocale: "ro" });
    const en = await account();
    await new PostgresConsumerSecurityRepository(runtime, audit).regenerateRecoveryCodes(en.session, await grant(en, "REGENERATE_RECOVERY_CODES"), Array.from({ length: 10 }, argon2Hash), { ip: "198.51.100.14", userAgent: "mail-locale-test", requestId: randomUUID(), mailLocale: "en" });

    const sent: { recipient: string; eventKind: string; locale: string | null }[] = [];
    const sender = {
      sendConsumerSecurityNotice: async (mail) => {
        sent.push({ recipient: mail.recipient, eventKind: mail.eventKind, locale: mail.display?.locale ?? null });
      }
    } as ConsumerSecurityNoticeSender;
    const users = { load: async (id: string) => { const dek = deks.get(id); if (dek === undefined) throw new Error("WRONG_DEK"); return Buffer.from(dek); } };
    await new ConsumerSecurityNoticeReconciler(new PostgresConsumerSecurityNoticeRepository(database.pool), users as never, sender).reconcile(100);

    // Every send to each account carries that account's stored language; the ro account holds one METHOD_CHANGED row
    // (the removal overwrites the fixture's en row for the same channel), the en account holds the CODES_REGENERATED row.
    const toRo = sent.filter((mail) => mail.recipient === ro.email);
    const toEn = sent.filter((mail) => mail.recipient === en.email);
    expect(toRo).toEqual([{ recipient: ro.email, eventKind: "METHOD_CHANGED", locale: "ro" }]);
    expect(toEn).toEqual(expect.arrayContaining([{ recipient: en.email, eventKind: "CODES_REGENERATED", locale: "en" }]));
    expect(toEn.every((mail) => mail.locale === "en")).toBe(true);
  });
});
