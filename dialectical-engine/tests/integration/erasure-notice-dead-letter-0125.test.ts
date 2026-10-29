import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  encrypt,
  generateDek,
  MemoryRunContentKeyStore,
  type AuditContextHasher,
  type ReadableUserDekStore
} from "../../packages/crypto/src/index.js";
import {
  AccountErasureCoordinator,
  assertAccountErasureDatabaseRole,
  migrate,
  PostgresAccountErasureRepository
} from "@debateai/db";
import { AccountErasureNotificationReconciler } from "../../apps/api/src/account-erasure.js";
import {
  isSingleDeliverableRecipient,
  MailDeliveryError,
  type SecurityNotificationMail,
  type SecurityNotificationSender
} from "../../apps/api/src/mail-channel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * NV-02 (security-audit run 3, K02). The erasure-notice outbox had no terminal state: 0040's
 * identity.fail_account_erasure_notification re-queued every failure 30 s later with no ceiling, and the readiness
 * gate that key destruction and FINALIZE ask is false while any unacknowledged row of the user exists, so one notice
 * refused on every attempt kept the account PREPARED (suspended, DEK and records kept) for ever. 0131's
 * erasure_reconcile.fail_account_erasure_notification dead-letters a row at once when the reconciler's own pre-send
 * check finds the stored address undeliverable (MAIL_RECIPIENT_UNDELIVERABLE), and otherwise only after 10 attempts
 * while the user's erasure is PREPARED; every other row re-queues with backoff (30 s doubling, at most 1 h). A dead
 * letter sets acknowledged_at with a DEAD: code and appends an identifier-free
 * identity.account.erasure_notice_dead_lettered audit event that survives FINALIZE.
 *
 * Embedded PostgreSQL, synthetic accounts only. Every case builds its own account and filters the batch outcomes by
 * its own message or erasure id, so no case depends on another's rows.
 */
const { Pool: PgPool } = pg;
let database: TestDatabase;
let repository: PostgresAccountErasureRepository;

const DEAD_LETTER_EVENT = "identity.account.erasure_notice_dead_lettered";
const source = () => ({ ip: "background", userAgent: "nv02-dead-letter-test", requestId: randomUUID() });

/** Test-local, as in tests/unit/s6-content-encryption.test.ts. */
class MemoryUserDekStore implements ReadableUserDekStore {
  readonly #keys = new Map<string, Buffer>();
  async store(userId: string, dek: Uint8Array): Promise<void> { this.#keys.set(userId, Buffer.from(dek)); }
  async load(userId: string): Promise<Buffer> {
    const key = this.#keys.get(userId);
    if (key === undefined) throw new Error("USER_DEK_NOT_FOUND");
    return Buffer.from(key);
  }
  async exists(userId: string): Promise<boolean> { return this.#keys.has(userId); }
  async destroy(userId: string): Promise<"DESTROYED" | "ALREADY_ABSENT"> {
    return this.#keys.delete(userId) ? "DESTROYED" : "ALREADY_ABSENT";
  }
}
const users = new MemoryUserDekStore();
const opaqueHash = (): string => `sha256:${randomBytes(32).toString("hex")}`;

type ScheduledUser = Readonly<{
  userId: string; ownerRef: string; sessionId: string; channelId: string; address: string;
  erasureId: string; scheduledMessageId: string;
}>;

/**
 * An active account with one verified email channel whose stored address is `address`, written directly (as the
 * superuser) so a case can hold a legacy address sign-up would now refuse, and a scheduled erasure (modelled on
 * s6-content-encryption-database.test.ts "delivers both encrypted channel notifications …").
 */
async function createScheduledUser(address: string): Promise<ScheduledUser> {
  const userId = randomUUID();
  const ownerRef = randomUUID();
  const sessionId = randomUUID();
  const channelId = randomUUID();
  const dek = generateDek();
  const envelope = encrypt(dek, Buffer.from(address, "utf8"),
    ["identity", "user.email_ciphertext", userId, "run:none", userId, `user-dek:${userId}`, "1"]);
  await users.store(userId, dek);
  dek.fill(0);
  await database.pool.query(`
    INSERT INTO identity."user"(
      user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
      phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
      adult_affirmed_at,created_at
    ) VALUES ($1,$2,$3::jsonb,'{}',NULL,'test-password-hash',$4,$5,$6,'active',clock_timestamp(),clock_timestamp())
  `, [userId, randomBytes(32), JSON.stringify(envelope), `nv02-${randomUUID()}`, randomUUID(), ownerRef]);
  await database.pool.query(`
    INSERT INTO identity.session(
      session_id,user_id,token_hash,csrf_token_hash,binding_context,
      created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at
    ) VALUES ($1,$2,$3,$4,$5::jsonb,clock_timestamp(),clock_timestamp(),
      clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours',clock_timestamp())
  `, [sessionId, userId, opaqueHash(), opaqueHash(), JSON.stringify({ user_agent_hash: opaqueHash() })]);
  await database.pool.query(`
    INSERT INTO identity.channel_binding(
      channel_binding_id,user_id,channel_type,address_ciphertext,state,created_at,verified_at
    ) VALUES ($1,$2,'email',$3::jsonb,'verified',clock_timestamp(),clock_timestamp())
  `, [channelId, userId, JSON.stringify(envelope)]);
  const grantTokenHash = opaqueHash();
  await database.pool.query(`
    INSERT INTO identity.step_up_grant(
      step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,
      target_account_id,issued_at,expires_at,consumed_at
    ) VALUES ($1,$2,$3,$4,'DELETE_ACCOUNT',NULL,$4,clock_timestamp(),clock_timestamp()+interval '10 minutes',NULL)
  `, [randomUUID(), grantTokenHash, sessionId, userId]);
  const scheduled = await repository.schedule({ userId, ownerRef, sessionId, grantTokenHash });
  expect(scheduled?.erasureId).toMatch(/^[0-9a-f-]{36}$/u);
  const erasureId = scheduled!.erasureId;
  const messages = (await database.pool.query<{ message_id: string }>(`
    SELECT message_id FROM identity.account_erasure_notification_outbox WHERE erasure_id=$1 AND event_kind='SCHEDULED'
  `, [erasureId])).rows;
  expect(messages).toHaveLength(1);
  return Object.freeze({
    userId, ownerRef, sessionId, channelId, address, erasureId, scheduledMessageId: messages[0]!.message_id
  });
}

/** Records every mail, then refuses as the production sender does (mail-channel.ts SendmailSecurityNotificationSender). */
function recordingSender(sent: SecurityNotificationMail[], failure?: string): SecurityNotificationSender {
  return {
    async sendSecurityNotification(mail): Promise<void> {
      sent.push(mail);
      if (!isSingleDeliverableRecipient(mail.recipient)) throw new MailDeliveryError("MAIL_INPUT_INVALID");
      if (failure !== undefined) throw new MailDeliveryError(failure);
    }
  };
}

/** No support data for these synthetic owners (C-1's fifth port). */
const noSupport = Object.freeze({
  async shredOwnerForErasure(): Promise<unknown> { return "NONE"; },
  async liveOwnerKeyCount(): Promise<number> { return 0; }
});

function coordinatorFor(userId: string): AccountErasureCoordinator {
  return new AccountErasureCoordinator(
    repository, users, new MemoryRunContentKeyStore(users, async () => userId), undefined, noSupport
  );
}

function only<T extends Readonly<{ messageId?: string; erasureId?: string }>>(items: readonly T[], id: string): T {
  const matching = items.filter((item) => item.messageId === id || item.erasureId === id);
  expect(matching).toHaveLength(1);
  return matching[0]!;
}

async function due(messageId: string): Promise<void> {
  await database.pool.query(`
    UPDATE identity.account_erasure_notification_outbox SET available_at=clock_timestamp()-interval '1 second'
    WHERE message_id=$1
  `, [messageId]);
}

/** Past the grace period (requested_at moves with execute_at, keeping CHECK (execute_at >= requested_at)). */
async function makeDue(erasureId: string): Promise<void> {
  await database.pool.query(`
    UPDATE identity.account_erasure_request
    SET requested_at=clock_timestamp()-interval '8 days',execute_at=clock_timestamp()-interval '1 day',
      reconcile_available_at=clock_timestamp()-interval '1 second'
    WHERE erasure_id=$1
  `, [erasureId]);
}

async function redue(erasureId: string): Promise<void> {
  await database.pool.query(`
    UPDATE identity.account_erasure_request SET reconcile_available_at=clock_timestamp()-interval '1 second'
    WHERE erasure_id=$1
  `, [erasureId]);
}

async function setAttempts(messageId: string, attempts: number): Promise<void> {
  await database.pool.query(
    "UPDATE identity.account_erasure_notification_outbox SET attempt_count=$2 WHERE message_id=$1", [messageId, attempts]
  );
}

async function outboxRow(messageId: string): Promise<{
  acknowledged: boolean; last_error_code: string | null; attempt_count: number; due_in_seconds: number;
} | undefined> {
  return (await database.pool.query<{
    acknowledged: boolean; last_error_code: string | null; attempt_count: number; due_in_seconds: number;
  }>(`
    SELECT acknowledged_at IS NOT NULL AS acknowledged,last_error_code,attempt_count,
      extract(epoch FROM available_at-clock_timestamp())::float8 AS due_in_seconds
    FROM identity.account_erasure_notification_outbox WHERE message_id=$1
  `, [messageId])).rows[0];
}

async function completionMessageId(erasureId: string): Promise<string> {
  const rows = (await database.pool.query<{ message_id: string }>(`
    SELECT message_id FROM identity.account_erasure_notification_outbox WHERE erasure_id=$1 AND event_kind='COMPLETION'
  `, [erasureId])).rows;
  expect(rows).toHaveLength(1);
  return rows[0]!.message_id;
}

type AuditRow = {
  event_type: string; target_type: string; target_id: string; success: boolean; justification: string | null;
  source_context: Record<string, unknown>; actor_key_ref: string;
};
async function deadLetterAudit(erasureId: string): Promise<AuditRow[]> {
  return (await database.pool.query<AuditRow>(`
    SELECT event_type,target_type,target_id,success,justification,source_context,actor_key_ref
    FROM identity.audit_event WHERE event_type=$1 AND target_id=$2 ORDER BY source_context->>'eventKind' DESC
  `, [DEAD_LETTER_EVENT, erasureId])).rows;
}

async function userRowExists(userId: string): Promise<boolean> {
  return (await database.pool.query(`SELECT 1 FROM identity."user" WHERE user_id=$1`, [userId])).rowCount === 1;
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  repository = new PostgresAccountErasureRepository(database.pool, {} as AuditContextHasher);
}, 600_000);

afterAll(async () => database?.stop());

describe("NV-02 · the erasure-notice outbox reaches a terminal state", () => {
  it("a stored undeliverable address is dead-lettered without a send, recorded, and erasure completes", async () => {
    const user = await createScheduledUser(`nv02-${randomUUID()}@example`);
    const sent: SecurityNotificationMail[] = [];
    const reconciler = new AccountErasureNotificationReconciler(repository, users, recordingSender(sent));
    const coordinator = coordinatorFor(user.userId);

    expect(only(await reconciler.reconcile(100), user.scheduledMessageId)).toEqual({
      messageId: user.scheduledMessageId, outcome: "DEAD_LETTERED", diagnosticStage: "recipient"
    });
    expect(sent.filter((mail) => mail.recipient === user.address)).toEqual([]);
    expect(await outboxRow(user.scheduledMessageId)).toMatchObject({
      acknowledged: true, last_error_code: "DEAD:MAIL_RECIPIENT_UNDELIVERABLE"
    });

    await makeDue(user.erasureId);
    expect(only(await coordinator.reconcile(source(), 100), user.erasureId))
      .toEqual({ erasureId: user.erasureId, outcome: "CONTENDED" });
    const completion = await completionMessageId(user.erasureId);
    expect(only(await reconciler.reconcile(100), completion)).toEqual({
      messageId: completion, outcome: "DEAD_LETTERED", diagnosticStage: "recipient"
    });
    expect(sent.filter((mail) => mail.recipient === user.address)).toEqual([]);

    await redue(user.erasureId);
    expect(only(await coordinator.reconcile(source(), 100), user.erasureId))
      .toEqual({ erasureId: user.erasureId, outcome: "CLEANED" });
    expect(await userRowExists(user.userId)).toBe(false);
    expect(await users.exists(user.userId)).toBe(false);

    const audit = await deadLetterAudit(user.erasureId);
    expect(audit.map(({ actor_key_ref: _actor, ...row }) => row)).toEqual(["SCHEDULED", "COMPLETION"].map((eventKind) => ({
      event_type: DEAD_LETTER_EVENT, target_type: "identity.account_erasure", target_id: user.erasureId,
      success: false, justification: "DEAD:MAIL_RECIPIENT_UNDELIVERABLE",
      source_context: { schema: "s10-account-erasure-notice-v1", eventKind, channelType: "email", reason: "recipient" }
    })));
    const serialized = JSON.stringify(audit);
    for (const identifier of [user.userId, user.ownerRef, user.channelId, user.address, user.sessionId]) {
      expect(serialized).not.toContain(identifier);
    }
  }, 120_000);

  it("a sender-thrown MAIL_INPUT_INVALID during the grace period retries", async () => {
    const user = await createScheduledUser(`nv02-${randomUUID()}@example.test`);
    const sent: SecurityNotificationMail[] = [];
    const reconciler = new AccountErasureNotificationReconciler(
      repository, users, recordingSender(sent, "MAIL_INPUT_INVALID")
    );

    const first = only(await reconciler.reconcile(100), user.scheduledMessageId);
    expect(first).toEqual({ messageId: user.scheduledMessageId, outcome: "FAILED" });
    expect(Object.keys(first).sort()).toEqual(["messageId", "outcome"]);
    expect(sent.filter((mail) => mail.recipient === user.address)).toHaveLength(1);
    expect(await outboxRow(user.scheduledMessageId)).toMatchObject({
      acknowledged: false, last_error_code: "MAIL_INPUT_INVALID"
    });
    expect(await deadLetterAudit(user.erasureId)).toEqual([]);

    // Far past the cap, but no PREPARED erasure: the row never blocks key destruction, so it keeps retrying.
    await setAttempts(user.scheduledMessageId, 50);
    await due(user.scheduledMessageId);
    expect(only(await reconciler.reconcile(100), user.scheduledMessageId))
      .toEqual({ messageId: user.scheduledMessageId, outcome: "FAILED" });
    expect(await outboxRow(user.scheduledMessageId)).toMatchObject({
      acknowledged: false, last_error_code: "MAIL_INPUT_INVALID", attempt_count: 51
    });
    expect(await deadLetterAudit(user.erasureId)).toEqual([]);
  }, 120_000);

  it("a transient failure retries with backoff and is never dead before PREPARE", async () => {
    const user = await createScheduledUser(`nv02-${randomUUID()}@example.test`);
    const reconciler = new AccountErasureNotificationReconciler(
      repository, users, recordingSender([], "SENDMAIL_EXIT_75")
    );
    for (let round = 1; round <= 12; round += 1) {
      await due(user.scheduledMessageId);
      expect(only(await reconciler.reconcile(100), user.scheduledMessageId).outcome, `round ${round}`).toBe("FAILED");
      const row = await outboxRow(user.scheduledMessageId);
      expect(row?.acknowledged).toBe(false);
      if (round === 3) {
        expect(row!.due_in_seconds).toBeGreaterThanOrEqual(110);
        expect(row!.due_in_seconds).toBeLessThanOrEqual(130);
      }
      if (round === 12) {
        expect(row!.due_in_seconds).toBeGreaterThan(3_500);
        expect(row!.due_in_seconds).toBeLessThanOrEqual(3_600);
      }
    }
    expect(await outboxRow(user.scheduledMessageId)).toMatchObject({
      acknowledged: false, last_error_code: "SENDMAIL_EXIT_75", attempt_count: 12
    });
    expect(await deadLetterAudit(user.erasureId)).toEqual([]);
  }, 120_000);

  it("after PREPARE a capped row dead-letters on its next failure, and erasure completes", async () => {
    const user = await createScheduledUser(`nv02-${randomUUID()}@example.test`);
    const reconciler = new AccountErasureNotificationReconciler(
      repository, users, recordingSender([], "SENDMAIL_EXIT_75")
    );
    const coordinator = coordinatorFor(user.userId);
    await setAttempts(user.scheduledMessageId, 9);
    await makeDue(user.erasureId);
    expect(only(await coordinator.reconcile(source(), 100), user.erasureId))
      .toEqual({ erasureId: user.erasureId, outcome: "CONTENDED" });
    expect(await repository.status(user.erasureId)).toBe("PREPARED");
    const completion = await completionMessageId(user.erasureId);

    await due(user.scheduledMessageId);
    await due(completion);
    const round = await reconciler.reconcile(100);
    expect(only(round, user.scheduledMessageId)).toEqual({
      messageId: user.scheduledMessageId, outcome: "DEAD_LETTERED", diagnosticStage: "attempt-cap"
    });
    expect(only(round, completion)).toEqual({ messageId: completion, outcome: "FAILED" });
    expect(await outboxRow(user.scheduledMessageId)).toMatchObject({
      acknowledged: true, last_error_code: "DEAD:SENDMAIL_EXIT_75", attempt_count: 10
    });

    await setAttempts(completion, 9);
    await due(completion);
    expect(only(await reconciler.reconcile(100), completion)).toEqual({
      messageId: completion, outcome: "DEAD_LETTERED", diagnosticStage: "attempt-cap"
    });

    await redue(user.erasureId);
    expect(only(await coordinator.reconcile(source(), 100), user.erasureId))
      .toEqual({ erasureId: user.erasureId, outcome: "CLEANED" });
    expect(await userRowExists(user.userId)).toBe(false);
    const audit = await deadLetterAudit(user.erasureId);
    expect(audit.map(({ source_context, justification }) => ({ source_context, justification }))).toEqual(
      ["SCHEDULED", "COMPLETION"].map((eventKind) => ({
        source_context: { schema: "s10-account-erasure-notice-v1", eventKind, channelType: "email", reason: "attempt-cap" },
        justification: "DEAD:SENDMAIL_EXIT_75"
      }))
    );
  }, 120_000);

  it("a lost claim is CONTENDED, the erasure role dead-letters through its own grants, and no other role may call it", async () => {
    await withRole("debateai_erasure_runtime", async (client) => {
      expect((await client.query<{ outcome: string }>(
        "SELECT erasure_reconcile.fail_account_erasure_notification($1,$2,'X') AS outcome", [randomUUID(), randomUUID()]
      )).rows[0]?.outcome).toBe("CONTENDED");
    });
    await withRole("debateai_runtime", async (client) => {
      await expect(client.query(
        "SELECT erasure_reconcile.fail_account_erasure_notification($1,$2,'X')", [randomUUID(), randomUUID()]
      )).rejects.toMatchObject({ code: "42501" });
    });

    // The production path: the erasure role's own USAGE and EXECUTE, and the definer's inner appender call.
    const user = await createScheduledUser(`nv02-${randomUUID()}@example.test`);
    const claimToken = (await database.pool.query<{ claim_token: string }>(`
      UPDATE identity.account_erasure_notification_outbox
      SET claim_token=gen_random_uuid(),claim_expires_at=clock_timestamp()+interval '5 minutes',
        attempt_count=attempt_count+1,last_error_code=NULL
      WHERE message_id=$1 RETURNING claim_token
    `, [user.scheduledMessageId])).rows[0]!.claim_token;
    await withRole("debateai_erasure_runtime", async (client) => {
      await expect(client.query(
        "SELECT erasure_reconcile.fail_account_erasure_notification($1,$2,'not a code')", [user.scheduledMessageId, claimToken]
      )).rejects.toMatchObject({ code: "22023", message: "ERASURE_NOTIFICATION_ERROR_CODE_INVALID" });
    });
    await withRole("debateai_erasure_runtime", async (client) => {
      expect((await client.query<{ outcome: string }>(
        "SELECT erasure_reconcile.fail_account_erasure_notification($1,$2,'MAIL_RECIPIENT_UNDELIVERABLE') AS outcome",
        [user.scheduledMessageId, claimToken]
      )).rows[0]?.outcome).toBe("DEAD_LETTERED_RECIPIENT");
    }, "COMMIT");
    expect(await deadLetterAudit(user.erasureId)).toHaveLength(1);
    expect(await outboxRow(user.scheduledMessageId)).toMatchObject({
      acknowledged: true, last_error_code: "DEAD:MAIL_RECIPIENT_UNDELIVERABLE"
    });

    const row = (await database.pool.query(`
      SELECT p.proowner=legacy.proowner AND p.proowner=appender.proowner AND p.proowner=n.nspowner AS owner_matches,
        p.prosecdef AS definer,p.provolatile::text AS volatility,p.proconfig AS config,
        (SELECT array_agg(role_name ORDER BY role_name) FROM unnest(ARRAY['public','debateai_runtime',
          'debateai_authorization_runtime','debateai_publication_cleanup','debateai_content_provision',
          'debateai_replay','debateai_erasure_runtime']) AS role_name
          WHERE has_function_privilege(role_name,p.oid,'EXECUTE')) AS executors,
        has_schema_privilege('debateai_erasure_runtime',n.oid,'USAGE') AS erasure_usage
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      CROSS JOIN pg_proc legacy CROSS JOIN pg_proc appender
      WHERE p.oid='erasure_reconcile.fail_account_erasure_notification(uuid,uuid,text)'::regprocedure
        AND legacy.oid='identity.fail_account_erasure_notification(uuid,uuid,text)'::regprocedure
        AND appender.oid='identity.append_audit_event_internal(uuid,text,text,text,text,timestamptz,jsonb,text,boolean,text)'::regprocedure
    `)).rows[0];
    expect(row).toEqual({
      owner_matches: true, definer: true, volatility: "v", config: ["search_path=pg_catalog"],
      executors: ["debateai_erasure_runtime"], erasure_usage: true
    });
  }, 120_000);

  it("a swapped erasure pool, or a missing grant, gets the bounded refusal", async () => {
    await withLogins(async ({ runtimePool, erasurePool }) => {
      await expect(assertAccountErasureDatabaseRole(runtimePool, erasurePool)).resolves.toBeUndefined();
      await expect(assertAccountErasureDatabaseRole(erasurePool, runtimePool))
        .rejects.toThrow(/^ERASURE_DATABASE_ROLE_MUST_BE_ISOLATED$/u);
      await expect(assertAccountErasureDatabaseRole(erasurePool, erasurePool))
        .rejects.toThrow(/^ERASURE_DATABASE_ROLE_MUST_BE_ISOLATED$/u);
      await database.pool.query(
        "REVOKE EXECUTE ON FUNCTION erasure_reconcile.fail_account_erasure_notification(uuid,uuid,text) FROM debateai_erasure_runtime"
      );
      try {
        await expect(assertAccountErasureDatabaseRole(runtimePool, erasurePool))
          .rejects.toThrow(/^ERASURE_DATABASE_ROLE_MUST_BE_ISOLATED$/u);
      } finally {
        await database.pool.query(
          "GRANT EXECUTE ON FUNCTION erasure_reconcile.fail_account_erasure_notification(uuid,uuid,text) TO debateai_erasure_runtime"
        );
      }
      await expect(assertAccountErasureDatabaseRole(runtimePool, erasurePool)).resolves.toBeUndefined();
    });
  }, 120_000);
});

/** Runs `use` as `role` in one transaction, rolled back unless `end` is COMMIT. */
async function withRole(role: string, use: (client: pg.PoolClient) => Promise<void>, end: "ROLLBACK" | "COMMIT" = "ROLLBACK"): Promise<void> {
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE ${role}`);
    await use(client);
    await client.query(end);
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

type Logins = Readonly<{ runtimePool: pg.Pool; erasurePool: pg.Pool }>;

/** One runtime and one erasure LOGIN, as s6-content-encryption-database.test.ts creates them. */
async function withLogins(use: (logins: Logins) => Promise<void>): Promise<void> {
  const suffix = randomUUID().replaceAll("-", "");
  const runtimeLogin = `nv02_runtime_${suffix}`;
  const erasureLogin = `nv02_erasure_${suffix}`;
  const password = `nv02-${randomUUID()}`;
  const loginUrl = (user: string): string => {
    const url = new URL(database.connectionString);
    url.username = user;
    url.password = password;
    return url.toString();
  };
  await database.pool.query(`
    CREATE ROLE ${runtimeLogin} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOREPLICATION NOBYPASSRLS PASSWORD '${password}';
    CREATE ROLE ${erasureLogin} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOREPLICATION NOBYPASSRLS PASSWORD '${password}';
    GRANT debateai_runtime TO ${runtimeLogin};
    GRANT debateai_erasure_runtime TO ${erasureLogin}
  `);
  const pools: pg.Pool[] = [];
  try {
    const open = (user: string): pg.Pool => { const pool = new PgPool({ connectionString: loginUrl(user), max: 2 }); pools.push(pool); return pool; };
    await use({ runtimePool: open(runtimeLogin), erasurePool: open(erasureLogin) });
  } finally {
    await Promise.all(pools.map(async (pool) => pool.end().catch(() => undefined)));
    await database.pool.query(`DROP ROLE IF EXISTS ${runtimeLogin}, ${erasureLogin}`);
  }
}
