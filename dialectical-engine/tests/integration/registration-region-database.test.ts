import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, PostgresIdentityRepository, type PendingAccountInput, type SignUpAcceptanceRow } from "@debateai/db";
import { createEmailBlindIndex, encrypt, generateDek, sealRecord, type AuditContextHasher } from "@debateai/crypto";
import { AGE_RULE_VERSION, MIN_AGE, REGION_COUNTRY_CODES, US_STATE_CODES, type DeclaredRegion } from "@debateai/kernel";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let repository: PostgresIdentityRepository;
const recordsKey = randomBytes(32);
const hasher = { hashSourceIp: async () => "11".repeat(32), hashUserAgent: async () => "22".repeat(32) } as unknown as AuditContextHasher;

async function sqlError(run: () => Promise<unknown>) {
  try { await run(); return { code: undefined, constraint: undefined, message: undefined }; }
  catch (error) { return error as { code?: string; constraint?: string; message?: string }; }
}
function signUpRows(): readonly SignUpAcceptanceRow[] {
  return (["ADULT", "TERMS", "PRIVACY_SHOWN"] as const).map((kind) => {
    const acceptanceId = randomUUID();
    const sealed = sealRecord(recordsKey, { table: "legal.acceptance", column: "evidence_ciphertext", rowId: acceptanceId }, Buffer.from(JSON.stringify({ ip: "81.196.1.2", user_agent: "test/1" })));
    return { acceptanceId, kind, documentVersion: kind === "PRIVACY_SHOWN" ? "3.0" : "2.0", documentSha256: "a".repeat(64), locale: "ro", evidenceCiphertext: sealed.ciphertext, keyId: sealed.keyId };
  });
}
function pendingInput(region: DeclaredRegion, options: { acceptances?: readonly SignUpAcceptanceRow[]; email?: string; pseudonym?: string; countryCode?: string } = {}): PendingAccountInput {
  const userId = randomUUID();
  const email = options.email ?? `${userId}@example.test`;
  const dek = generateDek();
  const keyId = `user-dek:${userId}`;
  return {
    userId, emailBlindIndex: createEmailBlindIndex(Buffer.alloc(32, 0x3c), email),
    emailCiphertext: encrypt(dek, Buffer.from(email), ["identity", "user.email_ciphertext", userId, "run:none", userId, keyId, "1"]),
    recoveryEmailCiphertext: encrypt(dek, Buffer.from(`r-${email}`), ["identity", "user.recovery_email_ciphertext", userId, "run:none", userId, keyId, "1"]),
    passwordHash: `$argon2id$v=19$m=65536,t=3,p=1$${"A".repeat(22)}$${"A".repeat(43)}`,
    pseudonym: options.pseudonym ?? `region-${userId}`,
    adultAffirmedAt: new Date(), ageCheck: { minAgeApplied: MIN_AGE, countryCode: options.countryCode ?? "RO", ruleVersion: AGE_RULE_VERSION },
    verificationTokenHash: `sha256:${createHash("sha256").update(userId).digest("hex")}`,
    verificationExpiresAt: new Date(Date.now() + 86_400_000), occurredAt: new Date(),
    source: { ip: "81.196.1.2", userAgent: "test/1", requestId: randomUUID() },
    declaredRegion: region, ...(options.acceptances === undefined ? {} : { acceptances: options.acceptances })
  };
}
async function bareAccount(state: "active" | "pending_verification" = "pending_verification") {
  const userId = randomUUID();
  await database.pool.query(`INSERT INTO identity."user" (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,phone_ciphertext,password_hash,pseudonym,state,adult_affirmed_at,created_at)
    VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'hash',$3,$4,now(),now())`, [userId, createHash("sha256").update(userId).digest(), `region-${userId}`, state]);
  return userId;
}
const regionRows = async (userId: string) => (await database.pool.query<{ country_code: string; us_state: string | null }>("SELECT country_code,us_state FROM identity.registration_region WHERE user_id=$1", [userId])).rows;

beforeAll(async () => { database = await startTestDatabase(); await migrate(database.pool); repository = new PostgresIdentityRepository(database.pool, hasher); }, 120_000);
afterAll(async () => database?.stop());

describe("registration region on real PostgreSQL", () => {
  it("B1 has exactly the three declared columns", async () => {
    const rows = (await database.pool.query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_schema='identity' AND table_name='registration_region' ORDER BY ordinal_position")).rows;
    expect(rows.map((row) => row.column_name)).toEqual(["user_id", "country_code", "us_state"]);
  });
  it("B2 constrains the exact TypeScript country and state sets", async () => {
    const result = await database.pool.query<{ conname: string; definition: string }>(`SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname IN ('registration_region_country_code_check','registration_region_us_state_check') ORDER BY conname`);
    expect(result.rows).toHaveLength(2);
    const codes = (name: string) => [...(result.rows.find((row) => row.conname === name)?.definition.matchAll(/'([A-Z]{2})'/g) ?? [])].map((match) => match[1]!);
    expect([...new Set(codes("registration_region_country_code_check"))].sort()).toEqual([...REGION_COUNTRY_CODES].sort());
    expect([...new Set(codes("registration_region_us_state_check").filter((code) => code !== "US"))].sort()).toEqual([...US_STATE_CODES].sort());
  });
  it("B3 refuses an unknown country, absent US state, foreign state, and duplicate row", async () => {
    const userId = await bareAccount();
    const insert = (country: string, state: string | null) => database.pool.query("INSERT INTO identity.registration_region(user_id,country_code,us_state) VALUES ($1,$2,$3)", [userId, country, state]);
    expect(await sqlError(() => insert("XX", null))).toMatchObject({ code: "23514", constraint: "registration_region_country_code_check" });
    expect(await sqlError(() => insert("US", null))).toMatchObject({ code: "23514", constraint: "registration_region_us_state_check" });
    expect(await sqlError(() => insert("RO", "CA"))).toMatchObject({ code: "23514", constraint: "registration_region_us_state_check" });
    await insert("RO", null);
    expect(await sqlError(() => insert("DE", null))).toMatchObject({ code: "23505", constraint: "registration_region_pkey" });
  });
  it("B4 writes one row through each account creation path", async () => {
    const first = pendingInput({ country: "US", usState: "TX" });
    expect((await repository.createPendingAccount(first, async () => undefined)).status).toBe("created");
    expect(await regionRows(first.userId)).toEqual([{ country_code: "US", us_state: "TX" }]);
    const second = pendingInput({ country: "RO", usState: null }, { acceptances: signUpRows() });
    expect((await repository.createPendingAccount(second, async () => undefined)).status).toBe("created");
    expect(await regionRows(second.userId)).toEqual([{ country_code: "RO", us_state: null }]);
  });
  it("B5 rolls the account and region row back together", async () => {
    const input = pendingInput({ country: "US", usState: "TX" });
    await expect(repository.createPendingAccount(input, async () => { throw new Error("forced"); })).rejects.toThrow("forced");
    expect((await database.pool.query('SELECT count(*)::int AS n FROM identity."user" WHERE user_id=$1', [input.userId])).rows[0]?.n).toBe(0);
    expect(await regionRows(input.userId)).toEqual([]);
  });
  it("B6 leaves rows unchanged on duplicate email and pseudonym", async () => {
    const email = `${randomUUID()}@example.test`;
    const first = pendingInput({ country: "US", usState: "TX" }, { email });
    expect((await repository.createPendingAccount(first, async () => undefined)).status).toBe("created");
    const duplicate = pendingInput({ country: "DE", usState: null }, { email });
    expect((await repository.createPendingAccount(duplicate, async () => undefined)).status).toBe("email_duplicate");
    expect(await regionRows(duplicate.userId)).toEqual([]);
    expect(await regionRows(first.userId)).toEqual([{ country_code: "US", us_state: "TX" }]);
    const collision = pendingInput({ country: "DE", usState: null }, { pseudonym: first.pseudonym });
    expect((await repository.createPendingAccount(collision, async () => undefined)).status).toBe("pseudonym_collision");
    expect(await regionRows(collision.userId)).toEqual([]);
  });
  it("B7 keeps the IP country apart from the declared country", async () => {
    const input = pendingInput({ country: "RO", usState: null }, { countryCode: "DE" });
    expect((await repository.createPendingAccount(input, async () => undefined)).status).toBe("created");
    expect((await database.pool.query<{ country_code: string }>("SELECT country_code FROM identity.age_check WHERE user_id=$1", [input.userId])).rows[0]?.country_code).toBe("DE");
    expect(await regionRows(input.userId)).toEqual([{ country_code: "RO", us_state: null }]);
  });
  it("B8 grants only the definer function to runtime", async () => {
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
      const row = await database.pool.query<{ allowed: boolean }>("SELECT has_table_privilege('debateai_runtime','identity.registration_region',$1) AS allowed", [privilege]);
      expect(row.rows[0]?.allowed).toBe(false);
    }
    const signature = "identity.record_registration_region(uuid,text,text)";
    expect((await database.pool.query<{ allowed: boolean }>("SELECT has_function_privilege('debateai_runtime',$1,'EXECUTE') AS allowed", [signature])).rows[0]?.allowed).toBe(true);
    expect((await database.pool.query<{ allowed: boolean }>("SELECT has_function_privilege('public',$1,'EXECUTE') AS allowed", [signature])).rows[0]?.allowed).toBe(false);
    const userId = await bareAccount();
    const client = await database.pool.connect();
    try {
      await client.query("BEGIN"); await client.query("SET LOCAL ROLE debateai_runtime");
      await client.query("SELECT identity.record_registration_region($1,'RO',NULL)", [userId]);
      expect(await sqlError(() => client.query("INSERT INTO identity.registration_region(user_id,country_code,us_state) VALUES ($1,'DE',NULL)", [userId]))).toMatchObject({ code: "42501" });
    } finally { await client.query("ROLLBACK"); client.release(); }
  });
  it("B9 refuses active accounts and permits pending accounts", async () => {
    const active = await bareAccount("active");
    const pending = await bareAccount();
    expect(await sqlError(() => database.pool.query("SELECT identity.record_registration_region($1,'RO',NULL)", [active]))).toMatchObject({ code: "22023", message: "REGION_ACCOUNT_INVALID" });
    expect(await regionRows(active)).toEqual([]);
    await database.pool.query("SELECT identity.record_registration_region($1,'RO',NULL)", [pending]);
    expect(await regionRows(pending)).toEqual([{ country_code: "RO", us_state: null }]);
  });
  it("B10 erasure cascades to the region row", async () => {
    const input = pendingInput({ country: "RO", usState: null }, { acceptances: signUpRows() });
    expect((await repository.createPendingAccount(input, async () => undefined)).status).toBe("created");
    await database.pool.query(`UPDATE identity."user" SET state='active' WHERE user_id=$1`, [input.userId]);
    const erasureId = randomUUID();
    await database.pool.query("INSERT INTO identity.account_erasure_request(erasure_id,user_id,requested_at,execute_at) VALUES ($1,$2,clock_timestamp()-interval '2 seconds',clock_timestamp()-interval '1 second')", [erasureId, input.userId]);
    expect((await database.pool.query<{ outcome: string }>("SELECT identity.prepare_account_erasure($1,'{}'::uuid[],'{}'::uuid[],'{}'::uuid[]) AS outcome", [erasureId])).rows[0]?.outcome).toBe("PREPARED");
    await database.pool.query("UPDATE identity.account_erasure_notification_outbox SET claim_token=gen_random_uuid(),claim_expires_at=NULL,acknowledged_at=clock_timestamp(),last_error_code=NULL WHERE user_id=$1 AND acknowledged_at IS NULL", [input.userId]);
    const eraser = await database.pool.connect();
    try {
      await eraser.query("BEGIN"); await eraser.query("SET LOCAL ROLE debateai_erasure_runtime");
      expect((await eraser.query<{ outcome: string }>("SELECT identity.finalize_account_erasure($1,clock_timestamp(),clock_timestamp(),0,0,1,0) AS outcome", [erasureId])).rows[0]?.outcome).toBe("COMMITTED");
      await eraser.query("COMMIT");
    } catch (error) { await eraser.query("ROLLBACK"); throw error; } finally { eraser.release(); }
    expect(await regionRows(input.userId)).toEqual([]);
  });
});
