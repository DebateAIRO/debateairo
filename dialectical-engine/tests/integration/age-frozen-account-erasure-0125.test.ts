import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  encrypt,
  generateDek,
  MemoryRunContentKeyStore,
  type AuditContextHasher,
  type ReadableUserDekStore
} from "../../packages/crypto/src/index.js";
import { AccountErasureCoordinator, migrate, PostgresAccountErasureRepository } from "@debateai/db";
import { AccountErasureNotificationReconciler } from "../../apps/api/src/account-erasure.js";
import type { SecurityNotificationMail, SecurityNotificationSender } from "../../apps/api/src/mail-channel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * NV-09 (security-audit run 3, K02). A pre-0077 account could schedule its erasure and then refuse the one-time age
 * check: 0077's freeze revokes every session and sets age_frozen without reading the pending request. 0040's preview
 * and 0110's PREPARE admit only an active owner, so the coordinator answered NOT_FOUND for ever and the person could
 * not cancel. 0131's erasure_reconcile.account_erasure_preview and erasure_reconcile.prepare_account_erasure are
 * copies that also admit age_frozen; PREPARE skips a frozen owner's expired orphan run-key intents and queues no
 * COMPLETION notice for it (0040's outbox parent trigger admits active owners only). The identity pair is unchanged.
 *
 * Embedded PostgreSQL, synthetic accounts only. Every case builds its own accounts and selects coordinator items by
 * erasure id and mails by message id or address, so no case depends on another's rows.
 */
let database: TestDatabase;
let repository: PostgresAccountErasureRepository;

const source = () => ({ ip: "background", userAgent: "nv09-age-frozen-erasure-test", requestId: randomUUID() });
const opaqueHash = (): string => `sha256:${randomBytes(32).toString("hex")}`;

/** Test-local, as in tests/integration/erasure-notice-dead-letter-0125.test.ts. */
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

type ScheduledUser = Readonly<{
  userId: string; ownerRef: string; address: string; erasureId: string; scheduledMessageId: string;
}>;

/**
 * An active account with no identity.age_check row, one verified email channel whose address is encrypted under the
 * user's DEK, a live session and a DELETE_ACCOUNT grant, and an erasure scheduled through the repository (as in
 * erasure-notice-dead-letter-0125.test.ts).
 */
async function createScheduledUser(): Promise<ScheduledUser> {
  const userId = randomUUID();
  const ownerRef = randomUUID();
  const sessionId = randomUUID();
  const address = `nv09-${randomUUID()}@example.test`;
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
  `, [userId, randomBytes(32), JSON.stringify(envelope), `nv09-${randomUUID()}`, randomUUID(), ownerRef]);
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
  `, [randomUUID(), userId, JSON.stringify(envelope)]);
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
  return Object.freeze({ userId, ownerRef, address, erasureId, scheduledMessageId: messages[0]!.message_id });
}

type BareAccount = Readonly<{ userId: string; ownerRef: string; sessionId: string; erasureId: string | null }>;

/**
 * A minimal s10-t9 fixtureAccount (s10-t9-account-erasure-races.test.ts): verified email and recovery_email channels,
 * a live session and, unless `due` is false, a DUE erasure request inserted as that file does (no SCHEDULED rows).
 */
async function bareAccount(label: string, due = true): Promise<BareAccount> {
  const userId = randomUUID();
  const ownerRef = randomUUID();
  const sessionId = randomUUID();
  const erasureId = due ? randomUUID() : null;
  await database.pool.query(`
    INSERT INTO identity."user"(
      user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
      phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
      adult_affirmed_at,created_at
    ) VALUES ($1,$2,'{}','{}',NULL,'test-password-hash',$3,$4,$5,'active',clock_timestamp(),clock_timestamp())
  `, [userId, randomBytes(32), `nv09-${label}-${randomUUID()}`, randomUUID(), ownerRef]);
  await database.pool.query(`
    INSERT INTO identity.channel_binding(
      channel_binding_id,user_id,channel_type,address_ciphertext,state,created_at,verified_at
    ) VALUES ($1,$3,'email','{}','verified',clock_timestamp(),clock_timestamp()),
      ($2,$3,'recovery_email','{}','verified',clock_timestamp(),clock_timestamp())
  `, [randomUUID(), randomUUID(), userId]);
  await database.pool.query(`
    INSERT INTO identity.session(
      session_id,user_id,token_hash,csrf_token_hash,binding_context,
      created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at
    ) VALUES ($1,$2,$3,$4,jsonb_build_object('user_agent_hash',$5::text),clock_timestamp(),clock_timestamp(),
      clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours',clock_timestamp())
  `, [sessionId, userId, opaqueHash(), opaqueHash(), opaqueHash()]);
  if (erasureId !== null) {
    await database.pool.query(`
      INSERT INTO identity.account_erasure_request(erasure_id,user_id,requested_at,execute_at)
      VALUES ($1,$2,clock_timestamp()-interval '2 seconds',clock_timestamp()-interval '1 second')
    `, [erasureId, userId]);
  }
  return Object.freeze({ userId, ownerRef, sessionId, erasureId });
}

/** One orphan run-key intent (no run row) from core.prepare_run_key_provision; `expired` backdates it as s10-t9 does. */
async function orphanIntent(account: BareAccount, expired: boolean): Promise<string> {
  const runId = randomUUID();
  const executionRef = (await database.pool.query<{ execution_ref: string | null }>(
    "SELECT core.prepare_run_key_provision($1,$2,$3,$4) AS execution_ref",
    [runId, account.userId, account.ownerRef, account.sessionId]
  )).rows[0]?.execution_ref;
  expect(executionRef).toMatch(/^[0-9a-f-]{36}$/u);
  if (expired) {
    await database.pool.query(`
      UPDATE core.run_key_provision_intent
      SET requested_at=clock_timestamp()-interval '2 minutes',expires_at=clock_timestamp()-interval '1 minute'
      WHERE run_id=$1
    `, [runId]);
  }
  return runId;
}

/** A committed encrypted run of `account` (s10-t9 encryptedRunFixture's document), for a foreign publication intent. */
async function encryptedRun(account: BareAccount): Promise<string> {
  const runId = randomUUID();
  const executionRef = (await database.pool.query<{ execution_ref: string }>(
    "SELECT core.prepare_run_key_provision($1,$2,$3,$4) AS execution_ref",
    [runId, account.userId, account.ownerRef, account.sessionId]
  )).rows[0]!.execution_ref;
  const secret = randomBytes(32);
  const envelope = { v: 1, keyId: "nv09", nonce: "AA==", ct: "AA==", tag: "AA==" };
  const attestation = (await database.pool.query<{ attestation: Buffer }>(`
    SELECT audit_crypto_internal.hmac(
      core.content_envelope_attestation_bytes($1::uuid,'core.run',($1::uuid)::text,'content_ciphertext',$2::jsonb),
      $3,'sha256'
    ) AS attestation
  `, [runId, JSON.stringify(envelope), secret])).rows[0]!.attestation;
  const document = {
    runId, questionLine: "⟦DEBATEAI:CIPHERTEXT:V1⟧", askerId: `owner:${account.ownerRef}`, executionRef,
    callerScope: "ASKER", asOf: new Date().toISOString(), askerRiskTier: "casual", riskTier: "casual",
    tierSource: "ASKER", tierProvenanceRef: "nv09", compositionBudgetTier: "low", depthParams: { depth: 1 },
    discoveredPanel: [{ agentId: "nv09-agent" }], strangerSampleRate: 1, envelopeBasis: { source: "nv09" },
    registerVersion: 1, batteryVersion: "nv09", askContract: { ciphertext: true, v: 1 },
    contentCiphertext: envelope, contentAttestation: attestation.toString("base64"),
    contentAttestationSecret: secret.toString("base64")
  };
  expect((await database.pool.query<{ created: boolean }>(
    "SELECT core.create_encrypted_run($1::jsonb,$2,$3,$4::jsonb) AS created",
    [JSON.stringify(document), account.userId, account.ownerRef, JSON.stringify([])]
  )).rows[0]?.created).toBe(true);
  return runId;
}

/** The two writes of 0077's refusal (0077:101-108), as the superuser. */
async function freeze(userId: string): Promise<void> {
  await database.pool.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE user_id=$1", [userId]);
  await database.pool.query(`UPDATE identity."user" SET state='age_frozen' WHERE user_id=$1`, [userId]);
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

async function userState(userId: string): Promise<string | undefined> {
  return (await database.pool.query<{ state: string }>(
    `SELECT state FROM identity."user" WHERE user_id=$1`, [userId]
  )).rows[0]?.state;
}

async function completionCount(erasureId: string): Promise<number> {
  return (await database.pool.query<{ n: number }>(`
    SELECT count(*)::int AS n FROM identity.account_erasure_notification_outbox
    WHERE erasure_id=$1 AND event_kind='COMPLETION'
  `, [erasureId])).rows[0]!.n;
}

/** Runs `use` as `role` in one transaction with the mail-language carrier set, committed unless `use` throws. */
async function asRole<T>(role: string, use: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE ${role}`);
    await client.query("SELECT set_config('debateai.mail_locale','en',true)");
    const result = await use(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function prepareV2(erasureId: string): Promise<string> {
  return asRole("debateai_erasure_runtime", async (client) => (await client.query<{ outcome: string }>(
    "SELECT erasure_reconcile.prepare_account_erasure($1,'{}','{}','{}') AS outcome", [erasureId]
  )).rows[0]!.outcome);
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  repository = new PostgresAccountErasureRepository(database.pool, {} as AuditContextHasher, database.pool);
}, 600_000);

afterAll(async () => database?.stop());

describe("NV-09 · a scheduled erasure runs for an owner the age gate froze after scheduling", () => {
  it("a frozen owner's scheduled erasure prepares without a COMPLETION notice and completes", async () => {
    const user = await createScheduledUser();
    await makeDue(user.erasureId);
    await freeze(user.userId);

    // The N-1 preview still skips the frozen owner; the new one admits it.
    expect((await database.pool.query(
      "SELECT * FROM identity.account_erasure_preview($1)", [user.erasureId]
    )).rows).toEqual([]);
    const preview = (await database.pool.query<{ user_id: string }>(
      "SELECT * FROM erasure_reconcile.account_erasure_preview($1)", [user.erasureId]
    )).rows;
    expect(preview.map((row) => row.user_id)).toEqual([user.userId]);

    const coordinator = coordinatorFor(user.userId);
    expect(only(await coordinator.reconcile(source(), 100), user.erasureId))
      .toEqual({ erasureId: user.erasureId, outcome: "CONTENDED" });
    expect(await userState(user.userId)).toBe("suspended");
    expect((await database.pool.query<{ prepared: boolean }>(
      "SELECT prepared_at IS NOT NULL AS prepared FROM identity.account_erasure_request WHERE erasure_id=$1",
      [user.erasureId]
    )).rows[0]?.prepared).toBe(true);
    expect(await completionCount(user.erasureId)).toBe(0);

    const sent: SecurityNotificationMail[] = [];
    const sender: SecurityNotificationSender = { async sendSecurityNotification(mail) { sent.push(mail); } };
    const reconciler = new AccountErasureNotificationReconciler(repository, users, sender);
    expect(only(await reconciler.reconcile(100), user.scheduledMessageId))
      .toEqual({ messageId: user.scheduledMessageId, outcome: "ACKNOWLEDGED" });
    expect(sent.filter((mail) => mail.recipient === user.address).map((mail) => mail.eventKind)).toEqual(["SCHEDULED"]);

    await redue(user.erasureId);
    expect(only(await coordinator.reconcile(source(), 100), user.erasureId))
      .toEqual({ erasureId: user.erasureId, outcome: "CLEANED" });
    expect(await userState(user.userId)).toBeUndefined();
    expect(await users.exists(user.userId)).toBe(false);
    expect(await repository.status(user.erasureId)).toBe("CLEANED");
  }, 180_000);

  it("an active owner still gets COMPLETION notices from PREPARE v2", async () => {
    const user = await createScheduledUser();
    await makeDue(user.erasureId);
    expect(only(await coordinatorFor(user.userId).reconcile(source(), 100), user.erasureId))
      .toEqual({ erasureId: user.erasureId, outcome: "CONTENDED" });
    expect(await userState(user.userId)).toBe("suspended");
    // One live channel (email), so one COMPLETION row.
    expect(await completionCount(user.erasureId)).toBe(1);
  }, 180_000);

  it("a frozen owner's expired orphan run-key intent does not block PREPARE; unexpired, or an active owner's, still does", async () => {
    const frozenExpired = await bareAccount("f1");
    const frozenLive = await bareAccount("f2");
    const active = await bareAccount("a");
    const frozenPublication = await bareAccount("f3");
    const runOwner = await bareAccount("h", false);
    const f1Run = await orphanIntent(frozenExpired, true);
    const f2Run = await orphanIntent(frozenLive, false);
    await orphanIntent(active, true);
    // F3 has no run-key intent but one expired publication-key intent, on a run another owner holds so that its own
    // manifests stay empty (review r3 minor 2).
    const foreignRun = await encryptedRun(runOwner);
    await database.pool.query(`
      INSERT INTO serve.publication_key_provision_intent(
        publication_ref,run_id,user_id,owner_ref,session_id,grant_token_hash,requested_at,expires_at
      ) VALUES ($1,$2,$3,$4,$5,$6,clock_timestamp()-interval '2 minutes',clock_timestamp()-interval '1 minute')
    `, [randomUUID(), foreignRun, frozenPublication.userId, frozenPublication.ownerRef, frozenPublication.sessionId,
      opaqueHash()]);
    for (const account of [frozenExpired, frozenLive, frozenPublication]) await freeze(account.userId);

    expect(await prepareV2(frozenExpired.erasureId!)).toBe("PREPARED");
    expect(await prepareV2(frozenLive.erasureId!)).toBe("CONTENDED");
    expect(await prepareV2(active.erasureId!)).toBe("CONTENDED");
    expect(await prepareV2(frozenPublication.erasureId!)).toBe("CONTENDED");

    expect(await userState(frozenExpired.userId)).toBe("suspended");
    expect(await userState(frozenLive.userId)).toBe("age_frozen");
    expect(await userState(active.userId)).toBe("active");
    expect((await database.pool.query(
      "SELECT 1 FROM core.run_key_provision_intent WHERE run_id=$1", [f1Run]
    )).rowCount).toBe(1);
    expect((await database.pool.query(
      "SELECT 1 FROM core.run_key_provision_intent WHERE run_id=$1", [f2Run]
    )).rowCount).toBe(1);
    expect(await completionCount(frozenExpired.erasureId!)).toBe(0);

    // Settle any unacknowledged row within the outbox CHECKs (0040:909-915), then FINALIZE as the superuser.
    await database.pool.query(`
      UPDATE identity.account_erasure_notification_outbox
      SET acknowledged_at=clock_timestamp(),claim_token=gen_random_uuid(),claim_expires_at=NULL
      WHERE user_id=$1 AND acknowledged_at IS NULL
    `, [frozenExpired.userId]);
    expect((await database.pool.query<{ outcome: string }>(
      "SELECT identity.finalize_account_erasure($1,clock_timestamp(),clock_timestamp(),0,0,1,0) AS outcome",
      [frozenExpired.erasureId]
    )).rows[0]?.outcome).toBe("COMMITTED");
    expect((await database.pool.query(
      "SELECT 1 FROM core.run_key_provision_intent WHERE user_id=$1", [frozenExpired.userId]
    )).rowCount).toBe(0);
    expect((await database.pool.query(
      "SELECT 1 FROM identity.run_execution_binding WHERE run_id=$1", [f1Run]
    )).rowCount).toBe(0);
  }, 180_000);

  it("the N-1 functions are unchanged: identity.prepare_account_erasure still skips a frozen owner", async () => {
    const account = await bareAccount("n1");
    await freeze(account.userId);
    expect((await database.pool.query(
      "SELECT * FROM identity.account_erasure_preview($1)", [account.erasureId]
    )).rows).toEqual([]);
    expect(await asRole("debateai_erasure_runtime", async (client) => (await client.query<{ outcome: string }>(
      "SELECT identity.prepare_account_erasure($1,'{}','{}','{}') AS outcome", [account.erasureId]
    )).rows[0]!.outcome)).toBe("NOT_FOUND");
    expect(await userState(account.userId)).toBe("age_frozen");
  }, 120_000);

  it("both copies are faithful to their source", async () => {
    const migration = async (name: string): Promise<string> =>
      readFile(new URL(`../../migrations/${name}`, import.meta.url), "utf8");
    const between = (text: string, anchor: string, quote: string): string => {
      const at = text.indexOf(anchor);
      expect(at).toBeGreaterThanOrEqual(0);
      const open = text.indexOf(quote, at);
      const close = text.indexOf(quote, open + quote.length);
      return text.slice(open + quote.length, close);
    };
    const prosrc = async (signature: string): Promise<string> => (await database.pool.query<{ prosrc: string }>(
      "SELECT prosrc FROM pg_catalog.pg_proc WHERE oid=to_regprocedure($1)", [signature]
    )).rows[0]!.prosrc;
    const occurrences = (text: string, needle: string): number => text.split(needle).length - 1;
    const apply = (body: string, hunks: readonly (readonly [string, string])[]): string => {
      let text = body;
      for (const [original, replacement] of hunks) {
        expect(occurrences(text, original), original).toBe(1);
        text = text.replace(original, () => replacement);
      }
      return text;
    };

    const previewSource = between(await migration("0040_account_erasure.sql"),
      "FUNCTION identity.account_erasure_preview(", "$$");
    const prepareSource = between(await migration("0110_account_erasure_public_debates.sql"),
      "FUNCTION identity.prepare_account_erasure(", "$function$");
    expect(previewSource).toBe(await prosrc("identity.account_erasure_preview(uuid)"));
    expect(prepareSource).toBe(await prosrc("identity.prepare_account_erasure(uuid,uuid[],uuid[],uuid[])"));

    const previewHunks = [
      ["    AND identity_user.state='active'", "    AND identity_user.state IN ('active','age_frozen')"]
    ] as const;
    const prepareHunks = [
      // E1a
      ["  v_actor_ref uuid;", "  v_actor_ref uuid;\n  v_user_state text;"],
      // E1b (select list, then INTO list)
      ["    request.delete_public_debates", "    request.delete_public_debates,identity_user.state"],
      ["    v_delete_public_debates", "    v_delete_public_debates,v_user_state"],
      // E1c
      ["  IF v_execute_at>v_now THEN RETURN 'NOT_DUE'; END IF;",
        "  IF v_execute_at>v_now THEN RETURN 'NOT_DUE'; END IF;\n"
        + "  IF v_user_state IS NULL OR v_user_state NOT IN ('active','age_frozen') THEN RETURN 'NOT_FOUND'; END IF;"],
      // E2, on its two-line run-key anchor (the IF line alone occurs twice)
      ["    WHERE provision.user_id=v_user_id ORDER BY provision.run_id FOR UPDATE NOWAIT;\n"
        + "    IF FOUND THEN RETURN 'CONTENDED'; END IF;",
      "    WHERE provision.user_id=v_user_id ORDER BY provision.run_id FOR UPDATE NOWAIT;\n"
        + "    -- NV-09: an expired orphan intent (no run row) of an age_frozen owner can never commit: the commit\n"
        + "    -- locks refuse a non-active owner (0085:570). Account erasure's listByOwner sweep destroys its published\n"
        + "    -- key and FINALIZE's user delete cascades the row. For an active owner every intent blocks, as in 0110.\n"
        + "    IF FOUND AND (v_user_state<>'age_frozen' OR EXISTS (\n"
        + "      SELECT 1 FROM core.run_key_provision_intent AS provision\n"
        + "      WHERE provision.user_id=v_user_id\n"
        + "        AND (provision.expires_at>clock_timestamp()\n"
        + "          OR EXISTS (SELECT 1 FROM core.run AS run WHERE run.run_id=provision.run_id))\n"
        + "    )) THEN RETURN 'CONTENDED'; END IF;"],
      // E3
      ["      AND identity_user.state='active'", "      AND identity_user.state=v_user_state"],
      // E4 (open, close)
      ["    INSERT INTO identity.account_erasure_notification_outbox(",
        "    -- NV-09: no COMPLETION notice for an age_frozen owner. 0040's enforce_erasure_notification_parent admits\n"
        + "    -- outbox inserts for active owners only; that owner's SCHEDULED notices were queued at schedule time.\n"
        + "    IF v_user_state='active' THEN\n"
        + "    INSERT INTO identity.account_erasure_notification_outbox("],
      ["    ON CONFLICT (erasure_id,channel_binding_id,event_kind) DO NOTHING;",
        "    ON CONFLICT (erasure_id,channel_binding_id,event_kind) DO NOTHING;\n    END IF;"]
    ] as const;

    expect(apply(previewSource, previewHunks)).toBe(await prosrc("erasure_reconcile.account_erasure_preview(uuid)"));
    const copy = await prosrc("erasure_reconcile.prepare_account_erasure(uuid,uuid[],uuid[],uuid[])");
    expect(apply(prepareSource, prepareHunks)).toBe(copy);
    expect(occurrences(copy, "    ORDER BY provision.run_id,provision.publication_ref FOR UPDATE NOWAIT;\n"
      + "    IF FOUND THEN RETURN 'CONTENDED'; END IF;")).toBe(1);
    expect(copy).not.toContain("mail_locale");
  }, 120_000);

  it("only the erasure role may call the new functions", async () => {
    const account = await bareAccount("role");
    for (const sql of [
      "SELECT * FROM erasure_reconcile.account_erasure_preview($1)",
      "SELECT erasure_reconcile.prepare_account_erasure($1,'{}','{}','{}')"
    ]) {
      await expect(asRole("debateai_runtime", async (client) => client.query(sql, [account.erasureId])))
        .rejects.toMatchObject({ code: "42501" });
    }
    // The erasure witness's forbidden roles (packages/db/src/account-erasure.ts ERASURE_FORBIDDEN_ROLES) cannot run
    // either copy; the erasure runtime can run both.
    const executors = (await database.pool.query<{ signature: string; roles: string[] }>(`
      SELECT procedure.oid::regprocedure::text AS signature,
        ARRAY(SELECT candidate.role_name FROM unnest(ARRAY['public','debateai_runtime',
          'debateai_authorization_runtime','debateai_publication_cleanup','debateai_content_provision',
          'debateai_replay','debateai_erasure_runtime']) AS candidate(role_name)
          WHERE has_function_privilege(candidate.role_name,procedure.oid,'EXECUTE')
          ORDER BY candidate.role_name)::text[] AS roles
      FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid IN (to_regprocedure('erasure_reconcile.account_erasure_preview(uuid)'),
        to_regprocedure('erasure_reconcile.prepare_account_erasure(uuid,uuid[],uuid[],uuid[])'))
      ORDER BY 1
    `)).rows;
    expect(executors).toEqual([
      { signature: "erasure_reconcile.account_erasure_preview(uuid)", roles: ["debateai_erasure_runtime"] },
      { signature: "erasure_reconcile.prepare_account_erasure(uuid,uuid[],uuid[],uuid[])",
        roles: ["debateai_erasure_runtime"] }
    ]);
  }, 120_000);
});
