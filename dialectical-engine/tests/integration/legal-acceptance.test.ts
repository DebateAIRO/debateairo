import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AcceptanceRepository,
  migrate,
  PostgresIdentityRepository,
  type PendingAccountInput,
  type RegistrationAgeCheck,
  type SignUpAcceptanceRow
} from "@debateai/db";
import {
  Argon2WorkerPool,
  AuditContextHasher,
  createEmailBlindIndex,
  encrypt,
  generateDek,
  generatePseudonym,
  generateVerificationToken,
  hashToken,
  openRecord,
  sealRecord
} from "@debateai/crypto";
import { AGE_RULE_VERSION, MIN_AGE } from "@debateai/kernel";
import { AUTH_POLICY_REGISTER_ROWS, authPolicyFromRegisterRows } from "../../packages/register/src/auth-policy.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const SHA = "a".repeat(64);
const recordsKey = randomBytes(32);
const policy = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS);
let database: TestDatabase;
let argon2: Argon2WorkerPool;
let identity: PostgresIdentityRepository;

async function sqlState(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

function signUpRows(): readonly SignUpAcceptanceRow[] {
  return (["ADULT", "TERMS", "PRIVACY_SHOWN"] as const).map((kind) => {
    const acceptanceId = randomUUID();
    const sealed = sealRecord(recordsKey, {
      table: "legal.acceptance", column: "evidence_ciphertext", rowId: acceptanceId
    }, Buffer.from(JSON.stringify({ ip: "81.196.1.2", user_agent: "test/1" }), "utf8"));
    return Object.freeze({
      acceptanceId, kind,
      documentVersion: kind === "PRIVACY_SHOWN" ? "3.0" : "2.0",
      documentSha256: SHA, locale: "ro",
      evidenceCiphertext: sealed.ciphertext, keyId: sealed.keyId
    });
  });
}

/** A passed age check, as registration builds it (apps/api/src/registration.ts:1285-1289). */
const PASSED_AGE: RegistrationAgeCheck = Object.freeze({
  minAgeApplied: MIN_AGE, countryCode: "RO", ruleVersion: AGE_RULE_VERSION
});

function pendingInput(
  acceptances: readonly SignUpAcceptanceRow[] | undefined,
  email = `${randomUUID()}@example.test`,
  ageCheck: RegistrationAgeCheck = PASSED_AGE
): PendingAccountInput {
  const userId = randomUUID();
  const dek = generateDek();
  const keyId = `user-dek:${userId}`;
  return {
    userId,
    emailBlindIndex: createEmailBlindIndex(Buffer.alloc(32, 0x3c), email),
    emailCiphertext: encrypt(dek, Buffer.from(email), ["identity", "user.email_ciphertext", userId, "run:none", userId, keyId, "1"]),
    recoveryEmailCiphertext: encrypt(dek, Buffer.from(`r-${email}`), ["identity", "user.recovery_email_ciphertext", userId, "run:none", userId, keyId, "1"]),
    passwordHash: `$argon2id$v=19$m=65536,t=3,p=1$${"A".repeat(22)}$${"A".repeat(43)}`,
    pseudonym: generatePseudonym(),
    adultAffirmedAt: new Date(),
    // PR #41: every account is created under a passed age check (the date itself is never stored).
    ageCheck,
    verificationTokenHash: hashToken("verification", generateVerificationToken()),
    verificationExpiresAt: new Date(Date.now() + 86_400_000),
    occurredAt: new Date(),
    source: { ip: "81.196.1.2", userAgent: "test/1", requestId: randomUUID() },
    ...(acceptances === undefined ? {} : { acceptances })
  };
}

async function createAccount(acceptances: readonly SignUpAcceptanceRow[] | undefined, email = `${randomUUID()}@example.test`) {
  return identity.createPendingAccount(pendingInput(acceptances, email), async () => undefined);
}

async function ageRecord(userId: string) {
  return (await database.pool.query<{
    outcome: string; min_age_applied: number; country_code: string | null; rule_version: string; context: string;
  }>("SELECT outcome,min_age_applied,country_code,rule_version,context FROM identity.age_check WHERE user_id=$1",
    [userId])).rows;
}

async function ownerRefOf(userId: string): Promise<string> {
  return (await database.pool.query<{ owner_ref: string }>(
    `SELECT owner_ref FROM identity."user" WHERE user_id=$1`, [userId]
  )).rows[0]!.owner_ref;
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  argon2 = new Argon2WorkerPool();
  await argon2.ready();
  identity = new PostgresIdentityRepository(
    database.pool, new AuditContextHasher(argon2, Buffer.alloc(32, 0x6e), policy.auditSourceIpKdf)
  );
}, 120_000);

afterAll(async () => {
  await database?.stop();
  await argon2?.close();
});

describe("0079 legal.acceptance (paid plans L3a)", () => {
  it("installs the guards it claims, and runtime may only read and insert", async () => {
    const triggers = await database.pool.query<{ relation: string; fn: string }>(`
      SELECT trigger.tgrelid::regclass::text AS relation, trigger.tgfoid::regprocedure::text AS fn
      FROM pg_trigger AS trigger
      WHERE NOT trigger.tgisinternal
        AND trigger.tgrelid IN ('legal.acceptance'::regclass,'legal.account_closure'::regclass)
      ORDER BY 1,2`);
    expect(triggers.rows).toEqual([
      { relation: "legal.acceptance", fn: "core.reject_truncate()" },
      { relation: "legal.acceptance", fn: "legal.reject_mutation_outside_retention_purge()" },
      { relation: "legal.account_closure", fn: "core.reject_truncate()" },
      { relation: "legal.account_closure", fn: "legal.reject_mutation_outside_retention_purge()" }
    ]);
    const grants = await database.pool.query<{ privilege_type: string }>(`
      SELECT privilege_type FROM information_schema.role_table_grants
      WHERE table_schema='legal' AND table_name='acceptance' AND grantee='debateai_runtime'
      ORDER BY 1`);
    expect(grants.rows.map((row) => row.privilege_type)).toEqual(["INSERT", "SELECT"]);
  });

  it("writes ADULT, TERMS and PRIVACY_SHOWN with the account, keyed by owner_ref, evidence sealed", async () => {
    const rows = signUpRows();
    const created = await createAccount(rows);
    expect(created.status).toBe("created");
    if (created.status !== "created") throw new Error("unreachable");
    const ownerRef = await ownerRefOf(created.userId);
    const stored = await database.pool.query<{
      acceptance_id: string; kind: string; document_version: string; locale: string; surface: string;
      evidence_ciphertext: Buffer; key_id: string;
    }>(`SELECT acceptance_id,kind,document_version,locale,surface,evidence_ciphertext,key_id
        FROM legal.acceptance WHERE owner_ref=$1 ORDER BY kind`, [ownerRef]);
    expect(stored.rows.map((row) => row.kind)).toEqual(["ADULT", "PRIVACY_SHOWN", "TERMS"]);
    for (const row of stored.rows) {
      expect(row.surface).toBe("SIGN_UP");
      expect(row.locale).toBe("ro");
      const evidence = JSON.parse(openRecord(recordsKey, {
        table: "legal.acceptance", column: "evidence_ciphertext", rowId: row.acceptance_id
      }, row.evidence_ciphertext).toString("utf8")) as { ip: string; user_agent: string };
      expect(evidence).toEqual({ ip: "81.196.1.2", user_agent: "test/1" });
    }
    const repository = new AcceptanceRepository(database.pool);
    await expect(repository.latest(ownerRef, "TERMS")).resolves.toEqual({
      documentVersion: "2.0", documentSha256: SHA, locale: "ro", acceptedAt: expect.any(Date)
    });
    await expect(repository.latest(ownerRef, "RENEWAL_TERMS")).resolves.toBeNull();
    // R3-2: the age gate's record was written by the same wrapper call, exactly once.
    expect(await ageRecord(created.userId)).toEqual([{
      outcome: "passed", min_age_applied: MIN_AGE, country_code: "RO", rule_version: AGE_RULE_VERSION, context: "registration"
    }]);
  });

  it("is ONE transaction with the age record: a refused age record leaves no account and no acceptance row", async () => {
    const rows = signUpRows();
    // identity.age_check's CHECK (0077: rule_version ~ '^[a-z0-9][a-z0-9./-]{0,99}$') refuses this, inside the wrapper,
    // after the account and before the acceptance rows: the whole call rolls back.
    const input = pendingInput(rows, undefined, { ...PASSED_AGE, ruleVersion: "Not A Rule" });
    await expect(identity.createPendingAccount(input, async () => undefined)).rejects.toMatchObject({ code: "23514" });
    expect((await database.pool.query(`SELECT 1 FROM identity."user" WHERE user_id=$1`, [input.userId])).rows)
      .toHaveLength(0);
    expect((await database.pool.query("SELECT 1 FROM legal.acceptance WHERE acceptance_id = ANY($1::uuid[])",
      [rows.map((row) => row.acceptanceId)])).rows).toHaveLength(0);
  });

  it("keeps the old path, with its age record, when no acceptances are given", async () => {
    // Test compositions that predate the acceptance record (tests/integration/age-gate-database.test.ts:73) still work.
    const input = pendingInput(undefined);
    const created = await identity.createPendingAccount(input, async () => undefined);
    expect(created.status).toBe("created");
    expect((await ageRecord(input.userId)).map((row) => row.context)).toEqual(["registration"]);
    expect((await database.pool.query(
      `SELECT 1 FROM legal.acceptance WHERE owner_ref=(SELECT owner_ref FROM identity."user" WHERE user_id=$1)`,
      [input.userId])).rows).toHaveLength(0);
  });

  it("answers the newest acceptance of a kind with its whole pair and locale, by accepted_at", async () => {
    // P17's M1 attaches the Terms this row names (locale + sha256), so the answer must be the NEWEST
    // row's own pair, never a mix of rows and never whatever was inserted last.
    const repository = new AcceptanceRepository(database.pool);
    const ownerRef = randomUUID();
    const olderSha = "e".repeat(64);
    const newerSha = "f".repeat(64);
    const terms = (documentVersion: string, documentSha256: string, locale: string, acceptedAt: Date) => {
      const acceptanceId = randomUUID();
      const sealed = sealRecord(recordsKey, { table: "legal.acceptance", column: "evidence_ciphertext", rowId: acceptanceId }, Buffer.from("{}"));
      return {
        acceptanceId, ownerRef, kind: "TERMS" as const, documentVersion, documentSha256, locale,
        surface: "REACCEPT" as const, acceptedAt, evidenceCiphertext: sealed.ciphertext, keyId: sealed.keyId
      };
    };
    const newerAt = new Date("2026-08-02T10:00:00.000Z");
    // Written newest FIRST: the older row gets the later recorded_at, so only ORDER BY accepted_at picks right.
    await repository.recordAll([
      terms("2.1", newerSha, "ro", newerAt),
      terms("2.0", olderSha, "en", new Date("2026-08-01T10:00:00.000Z"))
    ]);
    await expect(repository.latest(ownerRef, "TERMS")).resolves.toEqual({
      documentVersion: "2.1", documentSha256: newerSha, locale: "ro", acceptedAt: newerAt
    });
    await expect(repository.latest(ownerRef, "PRIVACY_SHOWN")).resolves.toBeNull();
  });

  it("takes N.M for the documents and the hash-derived version for the checkout consents, nothing else", async () => {
    const repository = new AcceptanceRepository(database.pool);
    const ownerRef = randomUUID();
    const consentSha = "c".repeat(64);
    const row = (kind: "TERMS" | "RENEWAL_TERMS" | "IMMEDIATE_START", documentVersion: string, documentSha256: string) => {
      const acceptanceId = randomUUID();
      const sealed = sealRecord(recordsKey, { table: "legal.acceptance", column: "evidence_ciphertext", rowId: acceptanceId }, Buffer.from("{}"));
      return {
        acceptanceId, ownerRef, kind, documentVersion, documentSha256, locale: "en", surface: "CHECKOUT" as const,
        acceptedAt: new Date(), evidenceCiphertext: sealed.ciphertext, keyId: sealed.keyId
      };
    };
    await repository.recordAll([
      row("RENEWAL_TERMS", `sha256-${consentSha.slice(0, 12)}`, consentSha),
      row("IMMEDIATE_START", `sha256-${consentSha.slice(0, 12)}`, consentSha)
    ]);
    await expect(repository.latest(ownerRef, "RENEWAL_TERMS")).resolves.toEqual({
      documentVersion: `sha256-${consentSha.slice(0, 12)}`, documentSha256: consentSha, locale: "en",
      acceptedAt: expect.any(Date)
    });
    for (const refused of [
      row("RENEWAL_TERMS", "2.0", consentSha),
      row("RENEWAL_TERMS", `sha256-${"d".repeat(12)}`, consentSha),
      row("TERMS", `sha256-${SHA.slice(0, 12)}`, SHA)
    ]) {
      expect(await sqlState(() => repository.recordAll([refused])), refused.kind).toBe("23514");
    }
  });

  it("writes nothing for a duplicate address and refuses an incomplete acceptance set", async () => {
    const email = `${randomUUID()}@example.test`;
    await createAccount(signUpRows(), email);
    const before = Number((await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM legal.acceptance")).rows[0]!.count);
    const duplicate = await createAccount(signUpRows(), email);
    expect(duplicate.status).toBe("email_duplicate");
    const after = Number((await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM legal.acceptance")).rows[0]!.count);
    expect(after).toBe(before);
    await expect(createAccount(signUpRows().slice(0, 2))).rejects.toMatchObject({ code: "22023" });
  });

  it("is append-only: UPDATE, DELETE and TRUNCATE refuse, a runtime DELETE is not even granted", async () => {
    const created = await createAccount(signUpRows());
    if (created.status !== "created") throw new Error("unreachable");
    const ownerRef = await ownerRefOf(created.userId);
    expect(await sqlState(() => database.pool.query(
      "UPDATE legal.acceptance SET locale='en' WHERE owner_ref=$1", [ownerRef]))).toBe("55000");
    expect(await sqlState(() => database.pool.query(
      "DELETE FROM legal.acceptance WHERE owner_ref=$1", [ownerRef]))).toBe("55000");
    expect(await sqlState(() => database.pool.query("TRUNCATE legal.acceptance"))).toBe("55000");
    // The closure clock is guarded the same way: no edit, no delete outside the purge.
    expect(await sqlState(() => database.pool.query(
      "UPDATE legal.account_closure SET closed_at=closed_at"))).toBe("55000");
    expect(await sqlState(() => database.pool.query("DELETE FROM legal.account_closure"))).toBe("55000");
    expect(await sqlState(() => database.pool.query("TRUNCATE legal.account_closure"))).toBe("55000");
    const client = await database.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE debateai_runtime");
      await client.query("SET LOCAL debateai.retention_purge='on'");
      expect(await sqlState(() => client.query("DELETE FROM legal.acceptance WHERE owner_ref=$1", [ownerRef])))
        .toBe("42501");
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("dates an account's real erasure, and every acceptance row still opens with the records key after it", async () => {
    // Spec §2.8: "Erasure leaves billing and legal rows intact and readable with the records key."
    // Driven through the ONE production delete, identity.finalize_account_erasure (0040:5829), run as
    // debateai_erasure_runtime — the shape tests/integration/s10-t9-account-erasure-races.test.ts uses.
    const created = await createAccount(signUpRows());
    if (created.status !== "created") throw new Error("unreachable");
    const ownerRef = await ownerRefOf(created.userId);
    // The superuser stands in for the verification step and the grace period.
    await database.pool.query(`UPDATE identity."user" SET state='active' WHERE user_id=$1`, [created.userId]);
    const erasureId = randomUUID();
    await database.pool.query(`
      INSERT INTO identity.account_erasure_request(erasure_id,user_id,requested_at,execute_at)
      VALUES ($1,$2,clock_timestamp()-interval '2 seconds',clock_timestamp()-interval '1 second')
    `, [erasureId, created.userId]);
    await expect(database.pool.query<{ outcome: string }>(
      "SELECT identity.prepare_account_erasure($1,'{}'::uuid[],'{}'::uuid[],'{}'::uuid[]) AS outcome", [erasureId]
    )).resolves.toMatchObject({ rows: [{ outcome: "PREPARED" }] });
    // PREPARE queued the completion notices; the mail transport is verified elsewhere.
    await database.pool.query(`
      UPDATE identity.account_erasure_notification_outbox
      SET claim_token=gen_random_uuid(),claim_expires_at=NULL,
        acknowledged_at=clock_timestamp(),last_error_code=NULL
      WHERE user_id=$1 AND acknowledged_at IS NULL
    `, [created.userId]);
    const eraser = await database.pool.connect();
    try {
      await eraser.query("BEGIN");
      await eraser.query("SET LOCAL ROLE debateai_erasure_runtime");
      await expect(eraser.query<{ outcome: string }>(
        "SELECT identity.finalize_account_erasure($1,clock_timestamp(),clock_timestamp(),0,0,1,0) AS outcome",
        [erasureId]
      )).resolves.toMatchObject({ rows: [{ outcome: "COMMITTED" }] });
      await eraser.query("COMMIT");
    } catch (error) {
      await eraser.query("ROLLBACK");
      throw error;
    } finally {
      eraser.release();
    }
    expect((await database.pool.query(`SELECT 1 FROM identity."user" WHERE user_id=$1`, [created.userId])).rows)
      .toHaveLength(0);
    // The age gate's record belongs to the account (ON DELETE CASCADE, 0077) and went with it; the ADULT
    // acceptance row below is the one proof of the age affirmation that outlives the erasure.
    expect(await ageRecord(created.userId)).toEqual([]);
    // The AFTER DELETE trigger dated the closure under the erasure function's own role.
    const closure = await database.pool.query<{ closed_at: Date }>(
      "SELECT closed_at FROM legal.account_closure WHERE owner_ref=$1", [ownerRef]);
    expect(closure.rows).toHaveLength(1);
    expect(Math.abs(closure.rows[0]!.closed_at.getTime() - Date.now())).toBeLessThan(60_000);
    const kept = await database.pool.query<{ acceptance_id: string; evidence_ciphertext: Buffer }>(
      "SELECT acceptance_id,evidence_ciphertext FROM legal.acceptance WHERE owner_ref=$1", [ownerRef]);
    expect(kept.rows).toHaveLength(3);
    for (const row of kept.rows) {
      const evidence = JSON.parse(openRecord(recordsKey, {
        table: "legal.acceptance", column: "evidence_ciphertext", rowId: row.acceptance_id
      }, row.evidence_ciphertext).toString("utf8")) as { ip: string; user_agent: string };
      expect(evidence).toEqual({ ip: "81.196.1.2", user_agent: "test/1" });
    }
  });

  it("purges only rows whose account closed more than six years before the (clamped) clock, closure date included", async () => {
    const repository = new AcceptanceRepository(database.pool);
    const oldOwner = "0b7d6c6e-2f3a-4c5d-8e9f-0a1b2c3d4e5f";
    const recentOwner = "1c8e7d7f-3a4b-4d6e-9f0a-1b2c3d4e5f60";
    const liveOwner = "2d9f8e80-4b5c-4e7f-8a1b-2c3d4e5f6071";
    for (const ownerRef of [oldOwner, recentOwner, liveOwner]) {
      const acceptanceId = randomUUID();
      const sealed = sealRecord(recordsKey, { table: "legal.acceptance", column: "evidence_ciphertext", rowId: acceptanceId }, Buffer.from("{}"));
      await repository.recordAll([{
        acceptanceId, ownerRef, kind: "TERMS", documentVersion: "2.0", documentSha256: SHA, locale: "en",
        surface: "REACCEPT", acceptedAt: new Date(), evidenceCiphertext: sealed.ciphertext, keyId: sealed.keyId
      }]);
    }
    // The test is the superuser, so it can date two closures in the past; no runtime role can.
    await database.pool.query(`INSERT INTO legal.account_closure(owner_ref,closed_at) VALUES
      ($1, now() - interval '7 years'), ($2, now() - interval '5 years')`, [oldOwner, recentOwner]);
    const count = async (ownerRef: string) => Number((await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM legal.acceptance WHERE owner_ref=$1", [ownerRef])).rows[0]!.count);
    const closures = async (ownerRef: string) => Number((await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM legal.account_closure WHERE owner_ref=$1", [ownerRef])).rows[0]!.count);
    // A clock two years back sees neither closure as older than six years.
    await expect(database.pool.query<{ purged: string }>(
      "SELECT legal.purge_expired_acceptance(now() - interval '2 years')::text AS purged"))
      .resolves.toMatchObject({ rows: [{ purged: "0" }] });
    // A clock far in the future is clamped to now: the five-year closure survives. R-36: the
    // runtime role (P16c's yearly job) may call the function, though it may not DELETE itself.
    // Two rows go: the old owner's one acceptance row and its closure date (A15: the record, and
    // the date that links the erased owner_ref to its closure, end together).
    const runtime = await database.pool.connect();
    try {
      await runtime.query("BEGIN");
      await runtime.query("SET LOCAL ROLE debateai_runtime");
      await expect(runtime.query<{ purged: string }>(
        "SELECT legal.purge_expired_acceptance('3000-01-01T00:00:00Z')::text AS purged"))
        .resolves.toMatchObject({ rows: [{ purged: "2" }] });
      await runtime.query("COMMIT");
    } catch (error) {
      await runtime.query("ROLLBACK");
      throw error;
    } finally {
      runtime.release();
    }
    expect(await count(oldOwner)).toBe(0);
    expect(await closures(oldOwner)).toBe(0);
    expect(await count(recentOwner)).toBe(1);
    expect(await closures(recentOwner)).toBe(1);
    expect(await count(liveOwner)).toBe(1);
    // The purge left both guards armed: a plain DELETE still refuses afterwards.
    expect(await sqlState(() => database.pool.query("DELETE FROM legal.acceptance WHERE owner_ref=$1", [recentOwner])))
      .toBe("55000");
    expect(await sqlState(() => database.pool.query("DELETE FROM legal.account_closure WHERE owner_ref=$1", [recentOwner])))
      .toBe("55000");
  });
});
