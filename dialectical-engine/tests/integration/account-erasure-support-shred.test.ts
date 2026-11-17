import { randomBytes, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  generateDek,
  hashToken,
  MemoryRunContentKeyStore,
  type AuditContextHasher,
  type ReadableUserDekStore
} from "../../packages/crypto/src/index.js";
import {
  AccountErasureCoordinator,
  assertSupportKeyCoverage,
  createPool,
  migrate,
  PostgresAccountErasureRepository,
  PostgresSupportShredRepository
} from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * C-1 (security-audit run 3, K01): account erasure leaves the erased user's support chats and cases decryptable under
 * the support KEK. Support content is encrypted under per-session and per-case keys wrapped by the host support KEK,
 * not by the user DEK. The erasure now shreds every support session and case key bound to the owner before it
 * destroys the user DEK, with the same barrier, locks, classifier, zeroing and owner audit as
 * `pnpm support:shred --owner`, and FINALIZE waits for a readback on the support credential that finds none live.
 *
 * Since synthesis-flag S05, 0129_support_answer_scope.sql empties the support tables and revokes debateai_support's
 * INSERT on them, and the session, case and stored-transcript writers are retired, so no release writes a support row
 * and the shred is NONE for every owner. It stays as the erasure's guard for any support row a later release might
 * persist again, and this file proves that guard on the kept code (PostgresSupportShredRepository): seeded rows are
 * shredded and read back as 0, and an owner with none is NONE.
 *
 * Harness copied and trimmed from tests/integration/s8-publication-database.test.ts (identity, grant, schedule, due,
 * ACK) and tests/integration/support-shred.test.ts (seeding as the embedded superuser, as its seedShredTarget does
 * since 0129; the shred and readback on the support-principal pool).
 */

const source = Object.freeze({ ip: "192.0.2.9", userAgent: "C-1 Browser", requestId: "request:c-1" });
const fakeAuditHasher = Object.freeze({
  hashSourceIp: async () => "11".repeat(32),
  hashUserAgent: async () => "22".repeat(32)
}) as unknown as AuditContextHasher;
const at = new Date("2026-09-07T10:00:00.000Z");
const ZERO_KEY = Buffer.alloc(61);

let database: TestDatabase;
let erasurePool: Pool;
let erasureRepository: PostgresAccountErasureRepository;
let supportRolePool: Pool;
let runKeys: MemoryRunContentKeyStore;
const userDeks = new Map<string, Buffer>();
const userIdsByOwnerRef = new Map<string, string>();

const users: ReadableUserDekStore = Object.freeze({
  async store(userId: string, dek: Uint8Array): Promise<void> {
    userDeks.set(userId, Buffer.from(dek));
  },
  async load(userId: string): Promise<Buffer> {
    const dek = userDeks.get(userId);
    if (dek === undefined) throw new Error("USER_DEK_UNRESOLVED");
    return Buffer.from(dek);
  },
  async exists(userId: string): Promise<boolean> {
    return userDeks.has(userId);
  },
  async destroy(userId: string): Promise<"DESTROYED" | "ALREADY_ABSENT"> {
    return userDeks.delete(userId) ? "DESTROYED" : "ALREADY_ABSENT";
  }
});

type Identity = Readonly<{ userId: string; ownerRef: string; sessionId: string; grantTokenHash: string }>;

async function createIdentity(label: string): Promise<Identity> {
  const userId = randomUUID();
  const ownerRef = randomUUID();
  await database.pool.query(`
    INSERT INTO identity."user" (
      user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
      phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
      adult_affirmed_at,created_at
    ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'test-password',$3,$4,$5,'active',now(),now())
  `, [userId, randomBytes(32), `c1-${label}-${randomUUID()}`, randomUUID(), ownerRef]);
  await users.store(userId, generateDek());
  userIdsByOwnerRef.set(ownerRef, userId);
  await database.pool.query(`
    INSERT INTO identity.mfa_factor (
      mfa_factor_id,user_id,factor_type,secret_ciphertext,credential_id,public_key,
      state,created_at,verified_at,last_accepted_step
    ) VALUES ($1,$2,'totp','{}'::jsonb,NULL,NULL,'active',now(),now(),10)
  `, [randomUUID(), userId]);
  const sessionId = randomUUID();
  const now = new Date();
  await database.pool.query(`
    INSERT INTO identity.session (
      session_id,user_id,token_hash,csrf_token_hash,binding_context,
      created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at,revoked_at
    ) VALUES ($1,$2,$3,$4,'{}'::jsonb,$5,$5,$6,$7,$5,NULL)
  `, [
    sessionId,
    userId,
    `sha256:${randomBytes(32).toString("hex")}`,
    `sha256:${randomBytes(32).toString("hex")}`,
    now,
    new Date(now.getTime() + 3_600_000),
    new Date(now.getTime() + 7_200_000)
  ]);
  await database.pool.query(`
    INSERT INTO identity.channel_binding(
      channel_binding_id,user_id,channel_type,address_ciphertext,state,created_at,verified_at
    ) VALUES ($1,$2,'email','{}'::jsonb,'verified',clock_timestamp(),clock_timestamp())
  `, [randomUUID(), userId]);
  const grantTokenHash = hashToken("step-up-grant", `c1-${randomUUID()}`);
  await database.pool.query(`
    INSERT INTO identity.step_up_grant(
      step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,
      target_account_id,issued_at,expires_at,consumed_at
    ) VALUES ($1,$2,$3,$4,'DELETE_ACCOUNT',NULL,$4,
      clock_timestamp()-interval '1 second',clock_timestamp()+interval '10 minutes',NULL)
  `, [randomUUID(), grantTokenHash, sessionId, userId]);
  return Object.freeze({ userId, ownerRef, sessionId, grantTokenHash });
}

async function schedule(identity: Identity): Promise<string> {
  const scheduled = await erasureRepository.schedule({
    userId: identity.userId, ownerRef: identity.ownerRef,
    sessionId: identity.sessionId, grantTokenHash: identity.grantTokenHash
  });
  expect(scheduled).not.toBeNull();
  return scheduled!.erasureId;
}

async function due(userId: string): Promise<void> {
  await database.pool.query(`
    UPDATE identity.account_erasure_request
    SET requested_at=requested_at-interval '604800 seconds',
        execute_at=execute_at-interval '604800 seconds'
    WHERE user_id=$1 AND prepared_at IS NULL AND cancelled_at IS NULL
  `, [userId]);
}

async function ackNotifications(): Promise<void> {
  for (const claim of await erasureRepository.claimNotifications()) {
    expect(await erasureRepository.acknowledgeNotification(claim.messageId, claim.claimToken)).toBe(true);
  }
}

async function eraseToClean(erasureId: string, coordinator: AccountErasureCoordinator): Promise<string> {
  for (let round = 0; round < 4; round++) {
    const outcome = await coordinator.execute(erasureId, source);
    if (outcome === "CLEANED") return outcome;
    await ackNotifications();
  }
  throw new Error("C1_ERASURE_DID_NOT_CLEAN_WITHIN_FOUR_ROUNDS");
}

function liveWrappedKey(fill: number): Buffer {
  return Buffer.concat([Buffer.from([1]), Buffer.alloc(60, fill)]);
}

function contentV2(fill: number): Buffer {
  const envelope = Buffer.alloc(29, fill);
  envelope[0] = 2;
  return envelope;
}

/**
 * A session, its key and two content-v2 messages, and optionally a case and its key, written as the embedded superuser
 * (database.pool): 0129 revoked debateai_support's INSERT on these tables (support-shred.test.ts seedShredTarget).
 */
async function seedSupport(input: Readonly<{ ownerRef: string | null; sessionId: string; caseId?: string }>) {
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      INSERT INTO support.session(
        session_id,session_token_sha256,identity_owner_ref,language,state,kb_version,created_at
      ) VALUES($1,$2,$3,'en','OPEN',$4,$5)
    `, [
      input.sessionId,
      Buffer.from(`token:${input.sessionId}`).toString("hex").slice(0, 64).padEnd(64, "0"),
      input.ownerRef,
      "a".repeat(64),
      at
    ]);
    await client.query(`
      INSERT INTO support.session_key(session_id,wrapped_key,created_at) VALUES($1,$2,$3)
    `, [input.sessionId, liveWrappedKey(1), at]);
    await client.query(`
      INSERT INTO support.message(
        message_id,session_id,role,content_ciphertext,outcome,language,
        detected_language,redacted,received_at
      ) VALUES
        ($1,$2,'user',$3,'ANSWER_GROUNDED','en','en',false,$4),
        ($5,$2,'assistant',$6,'ANSWER_GROUNDED','en','en',false,$4)
    `, [randomUUID(), input.sessionId, contentV2(2), at, randomUUID(), contentV2(5)]);
    if (input.caseId !== undefined) {
      // The retired case writer copied the session's owner onto the case; set it so the readback's UNION branch runs.
      await client.query(`
        INSERT INTO support."case"(
          case_id,token_sha256,session_id,identity_owner_ref,language,created_at,
          transcript_snapshot_ciphertext,state
        ) VALUES($1,$2,$3,$4,'en',$5,$6,'NEW')
      `, [
        input.caseId,
        Buffer.from(`case:${input.caseId}`).toString("hex").slice(0, 64).padEnd(64, "0"),
        input.sessionId,
        input.ownerRef,
        at,
        contentV2(7)
      ]);
      await client.query(`
        INSERT INTO support.case_key(case_id,wrapped_key,created_at) VALUES($1,$2,$3)
      `, [input.caseId, liveWrappedKey(7), at]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function keyRows(sessionId: string, caseId?: string) {
  const session = (await database.pool.query<{ wrapped_key: Buffer; destroyed_at: Date | null; shredded_at: Date | null }>(`
    SELECT key.wrapped_key,key.destroyed_at,parent.shredded_at
    FROM support.session AS parent JOIN support.session_key AS key ON key.session_id=parent.session_id
    WHERE parent.session_id=$1
  `, [sessionId])).rows[0]!;
  const supportCase = caseId === undefined ? undefined : (await database.pool.query<{
    wrapped_key: Buffer; destroyed_at: Date | null; shredded_at: Date | null;
  }>(`
    SELECT key.wrapped_key,key.destroyed_at,parent.shredded_at
    FROM support."case" AS parent JOIN support.case_key AS key ON key.case_id=parent.case_id
    WHERE parent.case_id=$1
  `, [caseId])).rows[0]!;
  return { session, supportCase };
}

async function ownerAudits(ownerRef: string) {
  return (await database.pool.query<{
    target_kind: string; target_ref: string; os_user: string; keys_destroyed: number;
  }>(`
    SELECT target_kind,target_ref,os_user,keys_destroyed FROM support.shred_audit
    WHERE target_kind='owner' AND target_ref=$1
  `, [ownerRef])).rows;
}

function coordinator(): AccountErasureCoordinator {
  return new AccountErasureCoordinator(
    erasureRepository, users, runKeys, undefined, new PostgresSupportShredRepository(supportRolePool)
  );
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  const role = `c1_erasure_${randomUUID().replaceAll("-", "")}`;
  const password = `c1-${randomUUID()}`;
  await database.pool.query(`
    CREATE ROLE ${role} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOREPLICATION NOBYPASSRLS PASSWORD '${password}';
    GRANT debateai_erasure_runtime TO ${role}
  `);
  const url = new URL(database.connectionString);
  url.username = role;
  url.password = password;
  erasurePool = createPool(url.toString());
  erasureRepository = new PostgresAccountErasureRepository(erasurePool, fakeAuditHasher);
  expect((await erasurePool.query<{ rolsuper: boolean }>(
    "SELECT rolsuper FROM pg_roles WHERE rolname=current_user"
  )).rows[0]!.rolsuper).toBe(false);
  supportRolePool = createPool(database.connectionString);
  supportRolePool.on("connect", (client) => {
    // Queued on the client before any later query, so every connection this pool hands out has already dropped to
    // the capability role (tests/integration/support-shred.test.ts, DL2-F1).
    void client.query("SET ROLE debateai_support");
  });
  expect((await supportRolePool.query<{ current_user: string }>("SELECT current_user")).rows[0]?.current_user)
    .toBe("debateai_support");
  runKeys = new MemoryRunContentKeyStore(users, async (ownerRef) => {
    const userId = userIdsByOwnerRef.get(ownerRef);
    if (userId === undefined) throw new Error("OWNER_REF_UNRESOLVED");
    return userId;
  });
}, 120_000);

afterAll(async () => {
  await erasurePool?.end();
  await supportRolePool?.end();
  await database?.stop();
}, 120_000);

describe("C-1 · account erasure shreds the owner's support keys", () => {
  it("erasure shreds the owner's support session and case keys before FINALIZE", async () => {
    const identity = await createIdentity("owner");
    const ownerSession = randomUUID();
    const ownerCase = randomUUID();
    await seedSupport({ ownerRef: identity.ownerRef, sessionId: ownerSession, caseId: ownerCase });
    const anonymousSession = randomUUID();
    await seedSupport({ ownerRef: null, sessionId: anonymousSession });
    const otherOwner = randomUUID();
    await seedSupport({ ownerRef: otherOwner, sessionId: randomUUID(), caseId: randomUUID() });
    const messagesBefore = (await database.pool.query(
      "SELECT message_id,content_ciphertext FROM support.message WHERE session_id=$1 ORDER BY message_id",
      [ownerSession]
    )).rows;
    const caseSnapshotBefore = (await database.pool.query(
      `SELECT transcript_snapshot_ciphertext FROM support."case" WHERE case_id=$1`, [ownerCase]
    )).rows;

    const erasureId = await schedule(identity);
    await due(identity.userId);
    expect(await eraseToClean(erasureId, coordinator())).toBe("CLEANED");

    expect((await database.pool.query('SELECT 1 FROM identity."user" WHERE user_id=$1', [identity.userId])).rowCount)
      .toBe(0);
    expect((await database.pool.query("SELECT 1 FROM legal.account_closure WHERE owner_ref=$1", [identity.ownerRef]))
      .rowCount).toBe(1);
    const owned = await keyRows(ownerSession, ownerCase);
    expect(owned.session.wrapped_key.equals(ZERO_KEY)).toBe(true);
    expect(owned.session.destroyed_at).not.toBeNull();
    expect(owned.session.shredded_at).not.toBeNull();
    expect(owned.supportCase!.wrapped_key.equals(ZERO_KEY)).toBe(true);
    expect(owned.supportCase!.destroyed_at).not.toBeNull();
    expect(owned.supportCase!.shredded_at).not.toBeNull();
    // DR-188: the rows stay; only the keys are gone.
    expect((await database.pool.query(
      "SELECT message_id,content_ciphertext FROM support.message WHERE session_id=$1 ORDER BY message_id",
      [ownerSession]
    )).rows).toEqual(messagesBefore);
    expect((await database.pool.query(
      `SELECT transcript_snapshot_ciphertext FROM support."case" WHERE case_id=$1`, [ownerCase]
    )).rows).toEqual(caseSnapshotBefore);
    expect(await ownerAudits(identity.ownerRef)).toEqual([{
      target_kind: "owner", target_ref: identity.ownerRef, os_user: "account-erasure", keys_destroyed: 2
    }]);
    const shreds = new PostgresSupportShredRepository(supportRolePool);
    expect(await shreds.liveOwnerKeyCount(identity.ownerRef)).toBe(0);
    expect(await shreds.liveOwnerKeyCount(otherOwner)).toBe(2);
    const anonymous = await keyRows(anonymousSession);
    expect(anonymous.session.destroyed_at).toBeNull();
    expect(anonymous.session.wrapped_key.equals(liveWrappedKey(1))).toBe(true);
    await expect(assertSupportKeyCoverage(database.pool)).resolves.toBeUndefined();
  });

  it("repository: NONE, SHREDDED, ALREADY_SHREDDED and the readback, under debateai_support", async () => {
    const shreds = new PostgresSupportShredRepository(supportRolePool);
    const unknownOwner = randomUUID();
    await expect(shreds.shredOwnerForErasure(unknownOwner, "account-erasure", new Date()))
      .resolves.toEqual({ kind: "NONE" });
    expect(await ownerAudits(unknownOwner)).toEqual([]);
    expect(await shreds.liveOwnerKeyCount(unknownOwner)).toBe(0);

    const ownerRef = randomUUID();
    await seedSupport({ ownerRef, sessionId: randomUUID(), caseId: randomUUID() });
    expect(await shreds.liveOwnerKeyCount(ownerRef)).toBe(2);
    await expect(shreds.shredOwnerForErasure(ownerRef, "account-erasure", new Date())).resolves.toEqual({
      kind: "SHREDDED", counts: { sessions: 1, cases: 1, keysDestroyed: 2 }
    });
    expect(await shreds.liveOwnerKeyCount(ownerRef)).toBe(0);
    await expect(shreds.shredOwnerForErasure(ownerRef, "account-erasure", new Date()))
      .resolves.toEqual({ kind: "ALREADY_SHREDDED" });
    // The operator CLI's owner shred keeps its deliberate signal for an owner with no session.
    await expect(shreds.shredOwner(unknownOwner, "vitest", new Date()))
      .rejects.toThrow("SUPPORT_SHRED_TARGET_NOT_FOUND");
  });

  it("erasure of an owner with no support history completes and writes no shred audit", async () => {
    const identity = await createIdentity("no-support");
    const erasureId = await schedule(identity);
    await due(identity.userId);
    expect(await eraseToClean(erasureId, coordinator())).toBe("CLEANED");
    expect(await ownerAudits(identity.ownerRef)).toEqual([]);
  });

  it("erasure after an operator's manual owner shred completes and keeps that one audit row", async () => {
    const identity = await createIdentity("manual");
    await seedSupport({ ownerRef: identity.ownerRef, sessionId: randomUUID(), caseId: randomUUID() });
    await expect(new PostgresSupportShredRepository(supportRolePool).shredOwner(identity.ownerRef, "vitest", at))
      .resolves.toMatchObject({ kind: "SHREDDED" });
    const erasureId = await schedule(identity);
    await due(identity.userId);
    expect(await eraseToClean(erasureId, coordinator())).toBe("CLEANED");
    expect(await ownerAudits(identity.ownerRef)).toEqual([{
      target_kind: "owner", target_ref: identity.ownerRef, os_user: "vitest", keys_destroyed: 2
    }]);
  });

  it("the erasure shred gives up on a held owner lock within its lock timeout", async () => {
    const ownerRef = randomUUID();
    await seedSupport({ ownerRef, sessionId: randomUUID(), caseId: randomUUID() });
    const shreds = new PostgresSupportShredRepository(supportRolePool);
    const holder = await database.pool.connect();
    try {
      // The owner barrier's key (lockSupportDomain, domain 19370701), held at session level across the call.
      await holder.query("SELECT pg_catalog.pg_advisory_lock(19370701, pg_catalog.hashtext($1::uuid::text))", [ownerRef]);
      const started = Date.now();
      await expect(shreds.shredOwnerForErasure(ownerRef, "account-erasure", new Date()))
        .rejects.toMatchObject({ code: "55P03" });
      expect(Date.now() - started).toBeLessThan(10_000);
    } finally {
      await holder.query("SELECT pg_catalog.pg_advisory_unlock(19370701, pg_catalog.hashtext($1::uuid::text))", [ownerRef]);
      holder.release();
    }
    expect(await shreds.liveOwnerKeyCount(ownerRef)).toBe(2);
    await expect(shreds.shredOwnerForErasure(ownerRef, "account-erasure", new Date())).resolves.toEqual({
      kind: "SHREDDED", counts: { sessions: 1, cases: 1, keysDestroyed: 2 }
    });
  }, 30_000);
});
