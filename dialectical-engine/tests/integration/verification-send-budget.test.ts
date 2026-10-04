import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrate, PostgresIdentityRepository, type PendingAccountInput } from "@debateai/db";
import { AuditContextHasher, Argon2WorkerPool, encrypt, generateDek, generatePseudonym, hashToken } from "@debateai/crypto";
import { AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS, authPolicyFromRegisterRows } from "@debateai/register";
import { readFile } from "node:fs/promises";
import { createEmailBlindIndex } from "@debateai/crypto";
import { InProcessAuthRateLimiter, RegistrationService, RESEND_PUBLIC_RESPONSE } from "../../apps/api/src/registration.js";
import { MailDeliveryError, type VerificationMail } from "../../apps/api/src/mail-channel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let db: TestDatabase;
let workers: Argon2WorkerPool;
let repository: PostgresIdentityRepository;
const source = { ip: "198.51.100.5", userAgent: "task5-test", requestId: "task5-test" };
const policy = authPolicyFromRegisterRows(AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS);
const token = () => hashToken("verification", randomUUID());
beforeAll(async () => {
  db = await startTestDatabase(); await migrate(db.pool);
  workers = new Argon2WorkerPool(); await workers.ready();
  repository = new PostgresIdentityRepository(db.pool, new AuditContextHasher(workers, Buffer.alloc(32, 5), policy.auditSourceIpKdf));
});
afterAll(async () => { await workers?.close(); await db?.stop(); });

async function account(ttlMs = 86_400_000) {
  const userId = randomUUID(); const emailBlindIndex = createHash("sha256").update(userId).digest(); const dek = generateDek();
  const envelope = encrypt(dek, Buffer.from("fixture"), ["identity", "user.email_ciphertext", userId, "run:none", userId, `user-dek:${userId}`, "1"]); dek.fill(0);
  const occurredAt = new Date("2020-01-01T00:00:00Z");
  const input: PendingAccountInput & { verificationTokenTtlMs: number } = {
    userId, emailBlindIndex, emailCiphertext: envelope, recoveryEmailCiphertext: null, phoneCiphertext: envelope,
    phoneSource: "manual", phoneVerificationStatus: "unverified", phoneUpdatedAt: occurredAt,
    passwordHash: "test-password-hash", pseudonym: generatePseudonym(), adultAffirmedAt: occurredAt,
    ageCheck: { minAgeApplied: 18, countryCode: "RO", ruleVersion: "2026-08-21-v1" },
    verificationTokenHash: token(), verificationExpiresAt: new Date(occurredAt.getTime() + ttlMs),
    verificationTokenTtlMs: ttlMs, occurredAt, source
  };
  const before = new Date(); const result = await repository.createPendingAccount(input, async () => undefined);
  expect(result.status).toBe("created");
  if (result.status !== "created") throw new Error("fixture creation failed");
  return { input, result, before, emailBlindIndex, channel: result.channelBindingId, userId, ttlMs };
}
async function resend(a: Awaited<ReturnType<typeof account>>, ttlMs = a.ttlMs) {
  return repository.prepareVerificationResend({ emailBlindIndex: a.emailBlindIndex, tokenHash: token(),
    expiresAt: new Date(Date.parse("2020-01-01") + ttlMs), occurredAt: new Date("2020-01-01"),
    cooldownMs: 60_000, windowMs: 3_600_000, maximumSends: 3, mechanism: "atomic_rolling_reservation_ledger", tokenTtlMs: ttlMs, source });
}
async function shift(a: Awaited<ReturnType<typeof account>>, seconds: number) {
  await db.pool.query("UPDATE identity.verification_delivery_reservation SET reserved_at=reserved_at-($2 * interval '1 second') WHERE channel_binding_id=$1", [a.channel, seconds]);
}
async function count(a: Awaited<ReturnType<typeof account>>) {
  return Number((await db.pool.query("SELECT count(*) FROM identity.verification_delivery_reservation WHERE channel_binding_id=$1", [a.channel])).rows[0].count);
}

describe("atomic rolling verification reservations on real PostgreSQL", () => {
  it("reserves the initial attempt with authoritative issuance/expiry and request timestamps kept separately", async () => {
    const a = await account();
    const row = (await db.pool.query("SELECT r.reserved_at,c.issued_at,c.expires_at,u.created_at FROM identity.verification_delivery_reservation r JOIN identity.verification_token_credential c USING(channel_binding_id) JOIN identity.channel_binding b USING(channel_binding_id) JOIN identity.\"user\" u USING(user_id) WHERE b.channel_binding_id=$1", [a.channel])).rows[0];
    expect(row.reserved_at.getTime()).toBeGreaterThanOrEqual(a.before.getTime());
    expect(row.issued_at).toEqual(row.reserved_at); expect(row.expires_at.getTime() - row.issued_at.getTime()).toBe(86_400_000);
    expect(row.created_at).toEqual(a.input.occurredAt);
    expect(a.result).toMatchObject({ verificationExpiresAt: row.expires_at });
  });
  it("admits initial/60/120 seconds, refuses the fourth, and frees exactly one rolling slot", async () => {
    const a = await account(); expect(await resend(a)).toEqual({ status: "ignored" });
    await shift(a, 60); expect((await resend(a)).status).toBe("send");
    await shift(a, 60); expect((await resend(a)).status).toBe("send");
    await shift(a, 60); expect(await resend(a)).toEqual({ status: "ignored" }); expect(await count(a)).toBe(3);
    await shift(a, 3_420); expect((await resend(a)).status).toBe("send"); expect(await count(a)).toBe(3);
    expect(await resend(a)).toEqual({ status: "ignored" });
  });
  it("refuses just before spacing and hourly boundaries and admits at their inclusive eligibility endpoint", async () => {
    const a = await account(); await shift(a, 59); expect(await resend(a)).toEqual({ status: "ignored" });
    await shift(a, 1); expect((await resend(a)).status).toBe("send"); await shift(a, 60); expect((await resend(a)).status).toBe("send"); await shift(a, 60);
    await db.pool.query("UPDATE identity.verification_delivery_reservation SET reserved_at=clock_timestamp()-interval '3599 seconds' WHERE reservation_id=(SELECT reservation_id FROM identity.verification_delivery_reservation WHERE channel_binding_id=$1 ORDER BY reserved_at LIMIT 1)", [a.channel]);
    expect(await resend(a)).toEqual({ status: "ignored" });
    await shift(a, 1); expect((await resend(a)).status).toBe("send");
  });
  it("serializes twenty eligible candidates into one committed reservation", async () => {
    const a = await account(); await shift(a, 60);
    const results = await Promise.all(Array.from({ length: 20 }, () => resend(a)));
    expect(results.filter(r => r.status === "send")).toHaveLength(1); expect(await count(a)).toBe(2);
    const empty = await account(); await db.pool.query("DELETE FROM identity.verification_delivery_reservation WHERE channel_binding_id=$1", [empty.channel]);
    const emptyResults = await Promise.all(Array.from({ length:20 }, () => resend(empty)));
    expect(emptyResults.filter(r=>r.status==="send")).toHaveLength(1); expect(await count(empty)).toBe(1);
  });
  it("retains the budget after token pruning, consumption and delayed failed-delivery callbacks", async () => {
    const a = await account(10);
    await db.pool.query("UPDATE identity.verification_token_credential SET expires_at=issued_at+interval '10 milliseconds' WHERE channel_binding_id=$1", [a.channel]);
    await shift(a, 60); expect((await resend(a)).status).toBe("send"); await shift(a, 60); expect((await resend(a)).status).toBe("send");
    await repository.recordVerificationDelivery({ userId: a.userId, occurredAt: new Date("2030-01-01"), success: false, errorCode: "MAIL_DELIVERY_FAILED", source });
    await shift(a, 60); expect(await resend(a)).toEqual({ status: "ignored" }); expect(await count(a)).toBe(3);
    await db.pool.query("DELETE FROM identity.verification_token_credential WHERE channel_binding_id=$1", [a.channel]);
    expect(await resend(a)).toEqual({ status: "ignored" }); expect(await count(a)).toBe(3);
  });
  it("samples issuance after the account lock and returns the stored expiry", async () => {
    const a = await account(200); await shift(a, 60); const blocker = await db.pool.connect();
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT identity.lock_security_subjects(ARRAY[$1::uuid])", [a.userId]);
      const operation = resend(a, 200); await new Promise(resolve => setTimeout(resolve, 400)); const releasedAt = new Date(); await blocker.query("COMMIT");
      const result = await operation; expect(result.status).toBe("send");
      const credential = (await db.pool.query("SELECT issued_at,expires_at FROM identity.verification_token_credential WHERE channel_binding_id=$1 ORDER BY issued_at DESC LIMIT 1", [a.channel])).rows[0];
      expect(credential.issued_at.getTime()).toBeGreaterThanOrEqual(releasedAt.getTime()); expect(credential.expires_at.getTime() - credential.issued_at.getTime()).toBe(200);
      expect(result).toMatchObject({ verificationExpiresAt: credential.expires_at });
    } finally { await blocker.query("ROLLBACK"); blocker.release(); }
  });
  it("checks verification expiry after a lock wait and preserves older valid token family consumption", async () => {
    const a = await account(500); const blocker = await db.pool.connect();
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT identity.lock_security_subjects(ARRAY[$1::uuid])", [a.userId]);
      const operation = repository.consumeVerification({ tokenHash: a.input.verificationTokenHash, occurredAt: a.before, source });
      await new Promise(resolve => setTimeout(resolve, 650)); await blocker.query("COMMIT"); expect(await operation).toBe(false);
    } finally { await blocker.query("ROLLBACK"); blocker.release(); }
    const b = await account(); await shift(b, 60); expect((await resend(b)).status).toBe("send");
    expect(await repository.consumeVerification({ tokenHash: b.input.verificationTokenHash, occurredAt: new Date("2020-01-01"), source })).toBe(true);
    const rows = (await db.pool.query("SELECT consumed_at FROM identity.verification_token_credential WHERE channel_binding_id=$1", [b.channel])).rows;
    expect(rows).toHaveLength(2); expect(rows.every(r => r.consumed_at !== null)).toBe(true); expect(await count(b)).toBe(2);
    expect(await repository.consumeVerification({ tokenHash: b.input.verificationTokenHash, occurredAt: new Date(), source })).toBe(false);
    expect(await resend(b)).toEqual({ status: "ignored" });
  });
  it("rolls back the initial reservation with a failed DEK write and reserves none on duplicate creation", async () => {
    const a = await account();
    const duplicate = await repository.createPendingAccount({ ...a.input, userId: randomUUID(), pseudonym: generatePseudonym() }, async () => { throw new Error("should not provision duplicate"); });
    expect(duplicate.status).toBe("email_duplicate"); expect(await count(a)).toBe(1);
    const failed = { ...a.input, userId: randomUUID(), emailBlindIndex: createHash("sha256").update(randomUUID()).digest(), pseudonym: generatePseudonym(), verificationTokenHash: token() };
    await expect(repository.createPendingAccount(failed, async () => { throw new Error("DEK write failed"); })).rejects.toThrow("DEK write failed");
    expect((await db.pool.query("SELECT count(*) FROM identity.\"user\" WHERE user_id=$1", [failed.userId])).rows[0].count).toBe("0");
  });
  it("keeps missing, activated, cooling and capped SQL receipts equally empty", async () => {
    const a = await account(); const missing = { ...a, emailBlindIndex: createHash("sha256").update(randomUUID()).digest() };
    const receipts = [await resend(missing), await resend(a)]; await shift(a, 60); await resend(a); await shift(a, 60); await resend(a); await shift(a, 60); receipts.push(await resend(a));
    await db.pool.query("UPDATE identity.\"user\" SET state='pending_mfa' WHERE user_id=$1", [a.userId]); receipts.push(await resend(a));
    expect(receipts).toEqual(Array.from({ length: 4 }, () => ({ status: "ignored" })));
  });
  it("keeps failed transports and failed recording committed, sends stored expiry, and returns equal public ACKs", async () => {
    const delivered: VerificationMail[] = []; const logs: string[] = [];
    const log = vi.spyOn(console, "error").mockImplementation((...values) => { logs.push(values.join(" ")); });
    const failedRecord = vi.spyOn(repository, "recordVerificationDelivery").mockRejectedValueOnce(new Error("test record outage"));
    const blindIndexKey = Buffer.alloc(32, 9); const email = `${randomUUID()}@example.test`;
    const service = new RegistrationService({ repository, policy, blindIndexKey, argon2: workers,
      mail: { sendVerification: async (mail) => { delivered.push(mail); throw new MailDeliveryError("SENDMAIL_TEST_FAILED"); } },
      dekStore: { store: async () => undefined, destroy: async () => "ALREADY_ABSENT" },
      limiter: new InProcessAuthRateLimiter(policy.rateLimits, policy.rateLimitBucketCapacity, policy.rateLimitRefusalAuditIntervalMs), sleep: async () => undefined });
    try {
      await service.register({ email, password: "correct horse battery staple", phone: "+40722123456", adultAffirmed: true }, source);
      await service.drainMailDispatches();
      const binding = (await db.pool.query("SELECT channel.channel_binding_id,user_id FROM identity.channel_binding channel JOIN identity.\"user\" account USING(user_id) WHERE account.email_blind_index=$1 AND channel_type='email'", [createEmailBlindIndex(blindIndexKey, email)])).rows[0];
      const a = { channel: binding.channel_binding_id } as Awaited<ReturnType<typeof account>>;
      for (let n=0; n<2; n++) { await shift(a, 60); expect(await service.resendVerification({ email }, { ...source, ip: `198.51.100.${20+n}` })).toEqual(RESEND_PUBLIC_RESPONSE); await service.drainMailDispatches(); }
      await shift(a, 60); expect(await service.resendVerification({ email }, { ...source, ip: "198.51.100.22" })).toEqual(RESEND_PUBLIC_RESPONSE); await service.drainMailDispatches();
      expect(delivered).toHaveLength(3); expect(await count(a)).toBe(3);
      expect(new Set(delivered.map(mail => mail.attemptId)).size).toBe(3);
      for (const mail of delivered) {
        const credential = (await db.pool.query("SELECT expires_at FROM identity.verification_token_credential WHERE token_hash=$1", [hashToken("verification", mail.token)])).rows[0];
        expect(mail.expiresAt).toEqual(credential.expires_at);
      }
      expect(await service.resendVerification({ email: `${randomUUID()}@example.test` }, { ...source, ip: "198.51.100.23" })).toEqual(RESEND_PUBLIC_RESPONSE);
      await service.drainMailDispatches();
      expect(logs.filter(line => line.startsWith("[AUTH_MAIL_DELIVERY_FAILED]"))).toHaveLength(3);
      expect(logs.some(line => line.includes("DELIVERY_RECORD_FAILED"))).toBe(true);
      expect(logs.join(" ")).not.toContain(email);
    } finally { failedRecord.mockRestore(); log.mockRestore(); await service.drainMailDispatches(); }
  });
  it("preserves the historical per-row authority while the new mechanism uses reservation time", async () => {
    const a = await account(); await shift(a, 1_200);
    await db.pool.query("UPDATE identity.channel_binding SET verification_last_sent_at=clock_timestamp() WHERE channel_binding_id=$1", [a.channel]);
    const input = { emailBlindIndex: a.emailBlindIndex, tokenHash: token(), expiresAt: new Date(Date.now()+86_400_000), occurredAt: new Date(), tokenTtlMs: 86_400_000, cooldownMs: 1_200_000, windowMs: 3_600_000, maximumSends: 3, mechanism: "per_row_last_sent_timestamp_minimum_spacing" as const, source };
    expect(await repository.prepareVerificationResend(input)).toEqual({ status: "ignored" });
    expect((await resend(a)).status).toBe("send");
  });
  it("rolls back a resend reservation and hash when the audit capability rejects tampered context", async () => {
    const a = await account(); await shift(a, 60); const client = await db.pool.connect();
    try {
      await client.query("BEGIN"); await client.query("SELECT identity.begin_runtime_audit_attempt()");
      await expect(client.query("SELECT * FROM identity.prepare_verification_resend_reserved_with_audit($1,$2,86400000,$3,60000,3600000,3,'atomic_rolling_reservation_ledger',$4::jsonb)", [a.emailBlindIndex, token(), new Date(), JSON.stringify({ ipArgon2id: "tampered", userAgentArgon2id: "tampered" })])).rejects.toThrow();
      await client.query("ROLLBACK"); expect(await count(a)).toBe(1);
      expect((await db.pool.query("SELECT count(*) FROM identity.verification_token_credential WHERE channel_binding_id=$1", [a.channel])).rows[0].count).toBe("1");
      expect((await resend(a)).status).toBe("send");
    } finally { await client.query("ROLLBACK"); client.release(); }
  });
  it("revokes legacy runtime bypasses and direct ledger access, and cascades erasure", async () => {
    const a = await account();
    const privileges = (await db.pool.query(`SELECT
      has_table_privilege('debateai_runtime','identity.verification_delivery_reservation','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS direct,
      has_function_privilege('debateai_runtime','identity.prepare_verification_resend_with_audit(bytea,text,timestamptz,timestamptz,bigint,jsonb)','EXECUTE') AS legacy,
      has_function_privilege('debateai_runtime','identity.prepare_verification_resend_reserved_with_audit(bytea,text,bigint,timestamptz,bigint,bigint,integer,text,jsonb)','EXECUTE') AS reserved`)).rows[0];
    expect(privileges).toEqual({ direct: false, legacy: false, reserved: true });
    await expect(db.pool.query("TRUNCATE identity.verification_delivery_reservation")).rejects.toThrow();
    await db.pool.query("DELETE FROM identity.\"user\" WHERE user_id=$1", [a.userId]); expect(await count(a)).toBe(0);
  });
  it("conservatively seeds surviving and potentially pruned historical attempts from the shipped migration", async () => {
    const a = await account(); await db.pool.query("DELETE FROM identity.verification_delivery_reservation WHERE channel_binding_id=$1", [a.channel]);
    await db.pool.query("DELETE FROM identity.verification_token_credential WHERE channel_binding_id=$1", [a.channel]);
    const migration = await readFile(new URL("../../migrations/0096_verification_delivery_budget.sql", import.meta.url), "utf8");
    const seed = migration.slice(migration.indexOf("INSERT INTO identity.verification_delivery_reservation"), migration.indexOf("CREATE FUNCTION identity.enforce_verification_reservation_parent"));
    await db.pool.query(seed); expect(await count(a)).toBe(3); await shift(a,60); expect(await resend(a)).toEqual({ status:"ignored" });
  });

  it("keeps72 distinct live hashes across24 rolling hours, refuses extra sends, and never evicts a live token", async () => {
    const a = await account();
    const context = JSON.stringify({ ipArgon2id: `argon2id-audit:v1:${"a".repeat(64)}`, userAgentArgon2id: `argon2id-audit:v1:${"b".repeat(64)}` });
    const advance = async (seconds: number) => {
      await shift(a, seconds);
      await db.pool.query("UPDATE identity.verification_token_credential SET issued_at=issued_at-$2*interval '1 second',expires_at=expires_at-$2*interval '1 second' WHERE channel_binding_id=$1", [a.channel, seconds]);
    };
    const issue = async () => {
      const client = await db.pool.connect();
      try {
        await client.query("BEGIN"); await client.query("SELECT identity.begin_runtime_audit_attempt()");
        const receipt = (await client.query("SELECT * FROM identity.prepare_verification_resend_reserved_with_audit($1,$2,86400000,clock_timestamp(),60000,3600000,3,'atomic_rolling_reservation_ledger',$3::jsonb)", [a.emailBlindIndex, token(), context])).rows[0];
        await client.query("COMMIT"); return receipt.status;
      } finally { await client.query("ROLLBACK"); client.release(); }
    };
    for (let hour=0; hour<24; hour++) {
      if (hour>0) { await advance(3420); expect(await issue()).toBe("SEND"); }
      await advance(60); expect(await issue()).toBe("SEND");
      await advance(60); expect(await issue()).toBe("SEND");
      await advance(60); expect(await issue()).toBe("IGNORED");
      expect(await count(a)).toBe(3);
    }
    const credentials = (await db.pool.query("SELECT token_hash,expires_at FROM identity.verification_token_credential WHERE channel_binding_id=$1", [a.channel])).rows;
    expect(credentials).toHaveLength(72); expect(credentials.length).toBeLessThanOrEqual(73);
    expect(credentials.every(row => row.expires_at.getTime()>Date.now())).toBe(true);
    expect(credentials.some(row => row.token_hash===a.input.verificationTokenHash)).toBe(true);
  });
  it("samples initial issuance after its subject lock before starting the short lifetime", async () => {
    const a = await account(); const userId = randomUUID(); const input = { ...a.input, userId, emailBlindIndex: createHash("sha256").update(userId).digest(), pseudonym: generatePseudonym(), verificationTokenHash: token(), verificationTokenTtlMs: 100, verificationExpiresAt: new Date(a.input.occurredAt.getTime()+100) };
    const blocker = await db.pool.connect();
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT identity.lock_security_subjects(ARRAY[$1::uuid])", [userId]);
      const operation = repository.createPendingAccount(input, async () => undefined);
      await new Promise(resolve => setTimeout(resolve,400)); const releasedAt = Date.now(); await blocker.query("COMMIT");
      const result = await operation; expect(result.status).toBe("created");
      if (result.status!=="created") throw new Error("initial lock fixture failed");
      const credential = (await db.pool.query("SELECT issued_at,expires_at FROM identity.verification_token_credential WHERE token_hash=$1", [input.verificationTokenHash])).rows[0];
      expect(credential.issued_at.getTime()).toBeGreaterThanOrEqual(releasedAt);
      expect(credential.expires_at.getTime()-credential.issued_at.getTime()).toBe(100);
      expect(result.verificationExpiresAt).toEqual(credential.expires_at);
    } finally { await blocker.query("ROLLBACK"); blocker.release(); }
  });

});
