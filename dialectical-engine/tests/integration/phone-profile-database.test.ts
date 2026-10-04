import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, migrate, PostgresIdentityRepository, type PendingAccountInput, type Pool } from "@debateai/db";
import { createEmailBlindIndex, decrypt, encrypt, generateDek, hashToken, sealRecord, type AuditContextHasher } from "@debateai/crypto";
import { AGE_RULE_VERSION, MIN_AGE } from "@debateai/kernel";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let runtime: Pool;
let repository: PostgresIdentityRepository;
const number = "+40722123456";
const audit = { hashSourceIp: async () => "ab".repeat(32), hashUserAgent: async () => "cd".repeat(32) } as unknown as AuditContextHasher;
const aad = (id: string) => ["identity", "user.phone_ciphertext", id, "run:none", id, `user-dek:${id}`, "1"] as const;
function fixture(email = `${randomUUID()}@example.test`) {
  const userId = randomUUID();
  const dek = generateDek();
  const occurredAt = new Date();
  const input: PendingAccountInput = {
    userId, emailBlindIndex: createEmailBlindIndex(Buffer.alloc(32, 0x3c), email),
    emailCiphertext: encrypt(dek, Buffer.from(email), ["identity", "user.email_ciphertext", userId, "run:none", userId, `user-dek:${userId}`, "1"]),
    recoveryEmailCiphertext: null,
    phoneCiphertext: encrypt(dek, Buffer.from(number), aad(userId)),
    phoneSource: "manual", phoneVerificationStatus: "unverified", phoneUpdatedAt: occurredAt,
    passwordHash: "$argon2id$phone-profile-fixture", pseudonym: `phone-${userId}`,
    adultAffirmedAt: occurredAt, occurredAt,
    ageCheck: { minAgeApplied: MIN_AGE, countryCode: "RO", ruleVersion: AGE_RULE_VERSION },
    verificationTokenHash: hashToken("verification", randomUUID()), verificationExpiresAt: new Date(Date.now() + 86_400_000),
    source: { ip: "192.0.2.51", userAgent: "phone-profile-test", requestId: randomUUID() },
    acceptances: (["ADULT", "TERMS", "PRIVACY_SHOWN"] as const).map(kind => {
      const acceptanceId = randomUUID();
      const sealed = sealRecord(Buffer.alloc(32, 0x7e), { table: "legal.acceptance", column: "evidence_ciphertext", rowId: acceptanceId }, Buffer.from('{"ip":"192.0.2.51","user_agent":"phone-profile-test"}'));
      return { acceptanceId, kind, documentVersion: "1.0", documentSha256: "a".repeat(64), locale: "en", evidenceCiphertext: sealed.ciphertext, keyId: sealed.keyId };
    })
  };
  return { input, dek };
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  const url = new URL(database.connectionString);
  url.searchParams.set("options", "-c role=debateai_runtime");
  runtime = createPool(url.toString());
  repository = new PostgresIdentityRepository(runtime, audit);
}, 120_000);
afterAll(async () => { await runtime?.end(); await database?.stop(); });

describe("0095 encrypted manual phone and optional recovery", () => {
  it("creates two accounts sharing a phone under runtime privileges with SQL-null recovery and atomic legal evidence", async () => {
    expect((await runtime.query("SELECT current_user AS role")).rows[0].role).toBe("debateai_runtime");
    for (const account of [fixture(), fixture()]) {
      const result = await repository.createPendingAccount(account.input, async () => undefined);
      expect(result.status).toBe("created");
      const stored = (await database.pool.query(`SELECT phone_ciphertext,phone_source,phone_verification_status,phone_updated_at,
        recovery_email_ciphertext FROM identity."user" WHERE user_id=$1`, [account.input.userId])).rows[0];
      expect(stored.recovery_email_ciphertext).toBeNull();
      expect(stored.phone_source).toBe("manual");
      expect(stored.phone_verification_status).toBe("unverified");
      expect(stored.phone_updated_at).toEqual(account.input.occurredAt);
      expect(decrypt(account.dek, stored.phone_ciphertext, aad(account.input.userId)).toString()).toBe(number);
      expect(() => decrypt(account.dek, stored.phone_ciphertext, aad(randomUUID()))).toThrow();
      const bindings = (await database.pool.query("SELECT channel_type FROM identity.channel_binding WHERE user_id=$1", [account.input.userId])).rows;
      expect(bindings).toEqual([{ channel_type: "email" }]);
      expect((await database.pool.query("SELECT count(*)::int AS count FROM identity.verification_token_credential WHERE channel_binding_id=$1", [(result as { channelBindingId: string }).channelBindingId])).rows[0].count).toBe(1);
      expect((await database.pool.query('SELECT count(*)::int AS count FROM legal.acceptance a JOIN identity."user" u USING(owner_ref) WHERE u.user_id=$1', [account.input.userId])).rows[0].count).toBe(3);
      expect((await database.pool.query("SELECT count(*)::int AS count FROM identity.age_check WHERE user_id=$1", [account.input.userId])).rows[0].count).toBe(1);
      const auditRows = (await database.pool.query('SELECT a.* FROM identity.audit_event a JOIN identity."user" u ON a.actor_key_ref=u.audit_token::text WHERE u.user_id=$1', [account.input.userId])).rows;
      expect(auditRows.length).toBeGreaterThan(0);
      expect(JSON.stringify({ stored, auditRows })).not.toContain(number);
      account.dek.fill(0);
    }
  });

  it("rolls back account/channel/audit success when legal or age evidence fails", async () => {
    for (const fault of ["missing", "invalid", "age"] as const) {
      const account = fixture();
      const input = { ...account.input,
        ...(fault === "missing" ? { acceptances: account.input.acceptances!.slice(0, 2) } : {}),
        ...(fault === "invalid" ? { acceptances: account.input.acceptances!.map(row => ({ ...row, kind: "ADULT" as const })) } : {}),
        ...(fault === "age" ? { ageCheck: { ...account.input.ageCheck, minAgeApplied: 1 } } : {}) };
      const successesBefore = (await database.pool.query("SELECT count(*)::int AS count FROM identity.audit_event WHERE event_type='identity.registration' AND success=true")).rows[0].count;
      await expect(repository.createPendingAccount(input, async () => undefined)).rejects.toMatchObject({ code: fault === "age" ? "23514" : "22023" });
      expect((await database.pool.query('SELECT count(*)::int AS count FROM identity."user" WHERE user_id=$1', [input.userId])).rows[0].count).toBe(0);
      expect((await database.pool.query("SELECT count(*)::int AS count FROM identity.channel_binding WHERE user_id=$1", [input.userId])).rows[0].count).toBe(0);
      expect((await database.pool.query("SELECT count(*)::int AS count FROM identity.audit_event WHERE event_type='identity.registration' AND success=true")).rows[0].count).toBe(successesBefore);
      account.dek.fill(0);
    }
  });

  it("does not replace the victim phone or run the DEK write for a duplicate address", async () => {
    const email = `${randomUUID()}@example.test`;
    const victim = fixture(email);
    const attacker = fixture(email);
    await repository.createPendingAccount(victim.input, async () => undefined);
    let writes = 0;
    expect(await repository.createPendingAccount(attacker.input, async () => { writes += 1; })).toEqual({ status: "email_duplicate", userId: victim.input.userId });
    expect(writes).toBe(0);
    expect((await database.pool.query('SELECT phone_ciphertext FROM identity."user" WHERE user_id=$1', [victim.input.userId])).rows[0].phone_ciphertext).toEqual(victim.input.phoneCiphertext);
    victim.dek.fill(0); attacker.dek.fill(0);
  });

  it("keeps superseded constructors inaccessible to runtime and grants only the phone-required overloads", async () => {
    const oldSignature = "uuid,bytea,jsonb,jsonb,text,text,timestamptz,timestamptz,text,timestamptz,jsonb";
    const phoneSignature = `${oldSignature},jsonb,text,text,timestamptz`;
    for (const [name, suffix] of [["create_pending_account_with_audit", ""], ["create_pending_account_with_consent", ",smallint,text,text,jsonb"]]) {
      const old = `identity.${name}(${oldSignature}${suffix})`;
      const current = `identity.${name}(${phoneSignature}${suffix})`;
      expect((await database.pool.query("SELECT has_function_privilege('debateai_runtime',$1,'EXECUTE') AS allowed", [old])).rows[0].allowed).toBe(false);
      expect((await database.pool.query("SELECT has_function_privilege('debateai_runtime',$1,'EXECUTE') AS allowed", [current])).rows[0].allowed).toBe(true);
      for (const role of ["public", "debateai_replay", "debateai_erasure_runtime", "debateai_publication_cleanup", "debateai_content_provision"]) {
        expect((await database.pool.query("SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed", [role, current])).rows[0].allowed).toBe(false);
      }
      const owners = (await database.pool.query("SELECT proowner::text AS owner,prosecdef,proconfig FROM pg_proc WHERE oid IN ($1::regprocedure,$2::regprocedure)", [old, current])).rows;
      expect(new Set(owners.map(row => row.owner)).size).toBe(1);
      expect(owners.every(row => row.prosecdef && row.proconfig.includes("search_path=pg_catalog"))).toBe(true);
    }
    await expect(runtime.query("SELECT * FROM identity.create_pending_account_with_audit(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)"))
      .rejects.toMatchObject({ code: "42501" });
  });

  it("rejects SQL JSON-null recovery and missing phone even through the guarded runtime constructor", async () => {
    for (const fault of ["recovery", "phone"]) {
      const account = fixture();
      if (fault === "recovery") {
        const client = await runtime.connect();
        try {
          await client.query("BEGIN");
          await client.query("SELECT identity.begin_runtime_audit_attempt()");
          const input = account.input;
          await expect(client.query(`SELECT * FROM identity.create_pending_account_with_audit(
            $1,$2,$3::jsonb,'null'::jsonb,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,'manual','unverified',$7
          )`, [input.userId, input.emailBlindIndex, JSON.stringify(input.emailCiphertext), input.passwordHash,
            input.pseudonym, input.adultAffirmedAt, input.occurredAt, input.verificationTokenHash, input.verificationExpiresAt,
            JSON.stringify({ ipArgon2id: `argon2id-audit:v1:${"ab".repeat(32)}`, userAgentArgon2id: `argon2id-audit:v1:${"cd".repeat(32)}` }), JSON.stringify(input.phoneCiphertext)]))
            .rejects.toMatchObject({ code: "23514" });
        } finally { await client.query("ROLLBACK"); client.release(); }
      } else {
        await expect(repository.createPendingAccount({ ...account.input, phoneCiphertext: null } as never, async () => undefined))
          .rejects.toMatchObject({ code: "22023" });
      }
      expect((await database.pool.query('SELECT 1 FROM identity."user" WHERE user_id=$1', [account.input.userId])).rows).toHaveLength(0);
      account.dek.fill(0);
    }
  });

  it("rolls back encrypted profile and legal records if DEK storage fails before commit", async () => {
    const account = fixture();
    await expect(repository.createPendingAccount(account.input, async () => { throw new Error("DEK_STORAGE_FAILED"); }))
      .rejects.toThrow("DEK_STORAGE_FAILED");
    expect((await database.pool.query('SELECT 1 FROM identity."user" WHERE user_id=$1', [account.input.userId])).rows).toHaveLength(0);
    expect((await database.pool.query("SELECT 1 FROM identity.channel_binding WHERE user_id=$1", [account.input.userId])).rows).toHaveLength(0);
    account.dek.fill(0);
  });

  it("removes the stored phone through existing PREPARE and restricted erasure finalization", async () => {
    const account = fixture();
    await repository.createPendingAccount(account.input, async () => undefined);
    await database.pool.query('UPDATE identity."user" SET state=\'active\' WHERE user_id=$1', [account.input.userId]);
    await database.pool.query("UPDATE identity.channel_binding SET state='verified',verified_at=clock_timestamp() WHERE user_id=$1", [account.input.userId]);
    const erasureId = randomUUID();
    await database.pool.query("INSERT INTO identity.account_erasure_request(erasure_id,user_id,requested_at,execute_at) VALUES($1,$2,clock_timestamp()-interval '2 seconds',clock_timestamp()-interval '1 second')", [erasureId, account.input.userId]);
    expect((await database.pool.query("SELECT identity.prepare_account_erasure($1,'{}'::uuid[],'{}'::uuid[],'{}'::uuid[]) AS outcome", [erasureId])).rows[0].outcome).toBe("PREPARED");
    const notices = (await database.pool.query("SELECT channel_type FROM identity.account_erasure_notification_outbox WHERE user_id=$1", [account.input.userId])).rows;
    expect(notices).toEqual([{ channel_type: "email" }]);
    await database.pool.query("UPDATE identity.account_erasure_notification_outbox SET claim_token=gen_random_uuid(),claim_expires_at=NULL,acknowledged_at=clock_timestamp(),last_error_code=NULL WHERE user_id=$1", [account.input.userId]);
    const client = await database.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE debateai_erasure_runtime");
      expect((await client.query("SELECT identity.finalize_account_erasure($1,clock_timestamp(),clock_timestamp(),0,0,1,0) AS outcome", [erasureId])).rows[0].outcome).toBe("COMMITTED");
      await client.query("COMMIT");
    } finally { await client.query("ROLLBACK"); client.release(); }
    expect((await database.pool.query('SELECT 1 FROM identity."user" WHERE user_id=$1', [account.input.userId])).rows).toHaveLength(0);
    expect((await database.pool.query("SELECT 1 FROM identity.channel_binding WHERE user_id=$1", [account.input.userId])).rows).toHaveLength(0);
    account.dek.fill(0);
  });

  it("adds no raw phone column, lookup index, uniqueness or phone channel", async () => {
    const columns = (await database.pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema='identity' AND table_name='user' AND column_name LIKE '%phone%' ORDER BY column_name")).rows;
    expect(columns.map(row => row.column_name)).toEqual(["phone_ciphertext", "phone_source", "phone_updated_at", "phone_verification_status"]);
    expect((await database.pool.query("SELECT indexname FROM pg_indexes WHERE schemaname='identity' AND tablename='user' AND indexdef ILIKE '%phone%'")).rows).toHaveLength(0);
    expect((await database.pool.query("SELECT 1 FROM identity.channel_binding WHERE channel_type IN ('phone','sms','whatsapp')")).rows).toHaveLength(0);
  });

  it("preserves WhatsApp rejection and rejects inconsistent phone metadata", async () => {
    const account = fixture();
    await repository.createPendingAccount(account.input, async () => undefined);
    await expect(database.pool.query("INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext) VALUES($1,'whatsapp',$2::jsonb)", [account.input.userId, JSON.stringify(account.input.phoneCiphertext)])).rejects.toMatchObject({ code: "23514" });
    await expect(database.pool.query("UPDATE identity.channel_binding SET channel_type='whatsapp' WHERE user_id=$1", [account.input.userId])).rejects.toMatchObject({ code: "23514" });
    await expect(database.pool.query('UPDATE identity."user" SET phone_source=NULL WHERE user_id=$1', [account.input.userId])).rejects.toMatchObject({ code: "23514" });
    account.dek.fill(0);
  });
});
