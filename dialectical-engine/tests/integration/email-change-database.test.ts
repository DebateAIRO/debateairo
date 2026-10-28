import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool, PoolClient } from "pg";
import { createPool, migrate, PostgresEmailChangeRepository, PostgresSessionRepository, type LoginIdentityRecord } from "@debateai/db";
import type { AuditContextHasher, CryptoEnvelope } from "../../packages/crypto/src/index.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

// Turn 14 — change email. The repository is the only door: every capability is
// a SECURITY DEFINER function bound to a live session (or to a mailed bearer),
// and every outcome lands one row on the hash-chained audit.

let database: TestDatabase;
// NV-12: the bounded entry points are driven as the role that holds them (main.ts's authorization pool).
let authorization: Pool;

const source = Object.freeze({ ip: "192.0.2.14", userAgent: "T14 Browser", requestId: "request:t14" });
const fakeAuditHasher = Object.freeze({
  hashSourceIp: async () => "11".repeat(32),
  hashUserAgent: async () => "22".repeat(32)
}) as unknown as AuditContextHasher;

const envelope = (label: string): CryptoEnvelope =>
  ({ v: 1, alg: "test", label } as unknown as CryptoEnvelope);

function credentialHash(label: string): string {
  return `sha256:${createHash("sha256").update(`t14:${label}:${randomUUID()}`).digest("hex")}`;
}

function blindIndex(label: string): Buffer {
  return createHash("sha256").update(`t14-blind:${label}`).digest();
}

type Fixture = Readonly<{
  userId: string;
  auditToken: string;
  ownerRef: string;
  factorId: string;
  sessionId: string;
  sessionTokenHash: string;
  emailBlindIndex: Buffer;
}>;

const FIXTURE_PASSWORD_HASH = "$argon2id$fixture";

function poolWithHeldClient(client: PoolClient): Pool {
  const borrowed = new Proxy(client, {
    get(target, property, receiver) {
      if (property === "release") return () => undefined;
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  return {
    connect: async () => borrowed,
    query: (...args: Parameters<PoolClient["query"]>) => borrowed.query(...args)
  } as unknown as Pool;
}

async function fixtureAccount(label: string): Promise<Fixture> {
  const userId = randomUUID();
  const auditToken = randomUUID();
  const ownerRef = randomUUID();
  const emailBlindIndex = blindIndex(`${label}:${userId}`);
  await database.pool.query(`
    INSERT INTO identity."user" (
      user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
      phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,adult_affirmed_at,created_at
    ) VALUES ($1,$2,$3::jsonb,$4::jsonb,NULL,$8,$5,$6,$7,'active',now(),now())
  `, [
    userId, emailBlindIndex,
    JSON.stringify(envelope("current")), JSON.stringify(envelope("recovery")),
    `t14-${label}-${userId.slice(0, 8)}`, auditToken, ownerRef, FIXTURE_PASSWORD_HASH
  ]);
  const factorId = randomUUID();
  await database.pool.query(`
    INSERT INTO identity.mfa_factor (
      mfa_factor_id,user_id,factor_type,secret_ciphertext,credential_id,public_key,
      state,created_at,verified_at,last_accepted_step
    ) VALUES ($1,$2,'totp','{}'::jsonb,NULL,NULL,'active',now(),now(),10)
  `, [factorId, userId]);
  await database.pool.query(`
    INSERT INTO identity.channel_binding (user_id,channel_type,address_ciphertext,state,created_at,verified_at)
    VALUES ($1,'email',$2::jsonb,'verified',now(),now()),
      ($1,'recovery_email',$3::jsonb,'verified',now(),now())
  `, [userId, JSON.stringify(envelope("current")), JSON.stringify(envelope("recovery"))]);
  const sessionId = randomUUID();
  const sessionTokenHash = credentialHash("session");
  const now = new Date();
  await database.pool.query(`
    INSERT INTO identity.session (
      session_id,user_id,token_hash,csrf_token_hash,binding_context,
      created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at,revoked_at
    ) VALUES ($1,$2,$3,$4,'{}'::jsonb,$5,$5,$6,$7,$5,NULL)
  `, [
    sessionId, userId, sessionTokenHash, credentialHash("csrf"), now,
    new Date(now.getTime() + 86_400_000), new Date(now.getTime() + 7 * 86_400_000)
  ]);
  return Object.freeze({ userId, auditToken, ownerRef, factorId, sessionId, sessionTokenHash, emailBlindIndex });
}

async function fixtureGrant(account: Fixture, action = "CHANGE_EMAIL"): Promise<string> {
  const tokenHash = credentialHash("grant");
  const now = new Date();
  await database.pool.query(`
    INSERT INTO identity.step_up_grant (
      step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,target_account_id,
      issued_at,expires_at,consumed_at
    ) VALUES ($1,$2,$3,$4,$5,NULL,$4,$6,$7,NULL)
  `, [randomUUID(), tokenHash, account.sessionId, account.userId, action, now,
    new Date(now.getTime() + 60_000)]);
  return tokenHash;
}

function requestInput(account: Fixture, grantTokenHash: string, label = "new") {
  return Object.freeze({
    userId: account.userId,
    sessionId: account.sessionId,
    grantTokenHash,
    newEmailBlindIndex: blindIndex(`${label}:${account.userId}`),
    newEmailCiphertext: envelope(label),
    confirmTokenHash: credentialHash("confirm"),
    cancelTokenHash: credentialHash("cancel"),
    expiresAt: new Date(Date.now() + 24 * 3_600_000),
    source
  });
}

async function currentAddress(userId: string): Promise<Readonly<{ blind: Buffer; label: string; channel: string }>> {
  const row = await database.pool.query<{ blind: Buffer; label: string; channel: string }>(`
    SELECT account.email_blind_index AS blind,account.email_ciphertext->>'label' AS label,
      channel.address_ciphertext->>'label' AS channel
    FROM identity."user" AS account
    JOIN identity.channel_binding AS channel
      ON channel.user_id=account.user_id AND channel.channel_type='email'
    WHERE account.user_id=$1
  `, [userId]);
  return row.rows[0]!;
}

async function auditEvents(auditToken: string, eventType: string): Promise<readonly Readonly<{ decision: string; body: string }>[]> {
  const rows = await database.pool.query<{ decision: string; body: string }>(`
    SELECT decision,row_to_json(event)::text AS body FROM identity.audit_event AS event
    WHERE actor_key_ref=$1 AND event_type=$2 ORDER BY occurred_at
  `, [auditToken, eventType]);
  return rows.rows;
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  const url = new URL(database.connectionString);
  url.searchParams.set("options", "-c role=debateai_authorization_runtime");
  authorization = createPool(url.toString());
}, 120_000);

afterAll(async () => { await authorization?.end(); await database?.stop(); });

describe("Turn 14 change email on real PostgreSQL", () => {
  it("accepts a CHANGE_EMAIL step-up grant bound to the account and refuses one bound to a run", async () => {
    const account = await fixtureAccount("grant-shape");
    await expect(fixtureGrant(account)).resolves.toMatch(/^sha256:/);
    await expect(database.pool.query(`
      INSERT INTO identity.step_up_grant (
        step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,target_account_id,
        issued_at,expires_at
      ) VALUES ($1,$2,$3,$4,'CHANGE_EMAIL',$5,NULL,now(),now()+interval '1 minute')
    `, [randomUUID(), credentialHash("bad"), account.sessionId, account.userId, randomUUID()]))
      .rejects.toThrow(/step_up_grant_action_check/);
  });

  it("consumes the grant once, opens one pending change and leaves the current address in force", async () => {
    const account = await fixtureAccount("request");
    const repository = new PostgresEmailChangeRepository(database.pool, fakeAuditHasher);
    const grant = await fixtureGrant(account);
    const input = requestInput(account, grant);
    const opened = await repository.request(input);
    expect(opened).toMatchObject({ status: "PENDING", addressAvailable: true });
    if (opened.status !== "PENDING") throw new Error("unreachable");
    expect(opened.currentEmailCiphertext).toEqual(envelope("current"));
    expect(opened.expiresAt.getTime()).toBe(input.expiresAt.getTime());
    await expect(repository.request({ ...requestInput(account, grant) }))
      .resolves.toEqual({ status: "DENIED" });
    const address = await currentAddress(account.userId);
    expect(address.blind.equals(account.emailBlindIndex)).toBe(true);
    expect(address.label).toBe("current");
    const settings = await repository.readSettings({ userId: account.userId, sessionId: account.sessionId });
    expect(settings).toEqual({
      emailCiphertext: envelope("current"),
      recoveryEmailCiphertext: envelope("recovery"),
      pending: {
        emailChangeId: opened.emailChangeId,
        newEmailCiphertext: envelope("new"),
        expiresAt: input.expiresAt,
        lastSentAt: expect.any(Date)
      }
    });
    const requested = await auditEvents(account.auditToken, "identity.email_change.requested");
    expect(requested.map((row) => row.decision)).toEqual(["ALLOW"]);
    for (const row of requested) {
      expect(row.body).not.toContain(account.userId);
      expect(row.body).not.toContain(grant);
      expect(row.body).not.toContain(input.confirmTokenHash);
    }
  });

  it("refuses a grant minted for another action, another session, or past its expiry", async () => {
    const account = await fixtureAccount("wrong-grant");
    const repository = new PostgresEmailChangeRepository(database.pool, fakeAuditHasher);
    const deleteGrant = await fixtureGrant(account, "DELETE_ACCOUNT");
    await expect(repository.request(requestInput(account, deleteGrant))).resolves.toEqual({ status: "DENIED" });
    const other = await fixtureAccount("wrong-grant-other");
    const foreign = await fixtureGrant(other);
    await expect(repository.request(requestInput(account, foreign))).resolves.toEqual({ status: "DENIED" });
    const stale = await fixtureGrant(account);
    await database.pool.query(`
      UPDATE identity.step_up_grant SET issued_at=now()-interval '10 minutes',expires_at=now()-interval '1 second'
      WHERE token_hash=$1
    `, [stale]);
    await expect(repository.request(requestInput(account, stale))).resolves.toEqual({ status: "DENIED" });
    await expect(repository.readSettings({ userId: account.userId, sessionId: account.sessionId }))
      .resolves.toMatchObject({ pending: null });
  });

  it("answers UNCHANGED without consuming the grant when the new address is the current one", async () => {
    const account = await fixtureAccount("same");
    const repository = new PostgresEmailChangeRepository(database.pool, fakeAuditHasher);
    const grant = await fixtureGrant(account);
    await expect(repository.request({ ...requestInput(account, grant), newEmailBlindIndex: account.emailBlindIndex }))
      .resolves.toEqual({ status: "UNCHANGED" });
    await expect(repository.request(requestInput(account, grant))).resolves.toMatchObject({ status: "PENDING" });
  });

  it("reports an address owned by another account as unavailable without refusing the request", async () => {
    const owner = await fixtureAccount("owner");
    const account = await fixtureAccount("claimant");
    const repository = new PostgresEmailChangeRepository(database.pool, fakeAuditHasher);
    const opened = await repository.request({
      ...requestInput(account, await fixtureGrant(account)), newEmailBlindIndex: owner.emailBlindIndex
    });
    expect(opened).toMatchObject({ status: "PENDING", addressAvailable: false });
  });

  it("confirms once by the mailed bearer, swapping the sign-in address and the email channel together", async () => {
    const account = await fixtureAccount("confirm");
    const repository = new PostgresEmailChangeRepository(database.pool, fakeAuditHasher);
    const input = requestInput(account, await fixtureGrant(account));
    await repository.request(input);
    await expect(repository.confirm({ confirmTokenHash: input.confirmTokenHash, source }))
      .resolves.toBe("CONFIRMED");
    const address = await currentAddress(account.userId);
    expect(address.blind.equals(input.newEmailBlindIndex)).toBe(true);
    expect(address.label).toBe("new");
    expect(address.channel).toBe("new");
    await expect(repository.confirm({ confirmTokenHash: input.confirmTokenHash, source }))
      .resolves.toBe("INVALID");
    await expect(repository.cancelByToken({ cancelTokenHash: input.cancelTokenHash, source }))
      .resolves.toBe("INVALID");
    await expect(repository.readSettings({ userId: account.userId, sessionId: account.sessionId }))
      .resolves.toMatchObject({ emailCiphertext: envelope("new"), pending: null });
    expect((await auditEvents(account.auditToken, "identity.email_change.confirmed")).map((row) => row.decision))
      .toEqual(["ALLOW"]);
  });

  it("refuses an expired bearer and one whose address was taken meanwhile, changing nothing", async () => {
    const account = await fixtureAccount("expired");
    const repository = new PostgresEmailChangeRepository(database.pool, fakeAuditHasher);
    const input = requestInput(account, await fixtureGrant(account));
    await repository.request(input);
    await database.pool.query(`
      UPDATE identity.email_change_request SET issued_at=now()-interval '2 days',
        last_sent_at=now()-interval '2 days',expires_at=now()-interval '1 second'
      WHERE user_id=$1
    `, [account.userId]);
    await expect(repository.confirm({ confirmTokenHash: input.confirmTokenHash, source }))
      .resolves.toBe("EXPIRED");
    expect((await currentAddress(account.userId)).label).toBe("current");

    const racer = await fixtureAccount("race");
    const raced = requestInput(racer, await fixtureGrant(racer), "contested");
    await repository.request(raced);
    await database.pool.query(`UPDATE identity."user" SET email_blind_index=$1 WHERE user_id=$2`,
      [raced.newEmailBlindIndex, account.userId]);
    await expect(repository.confirm({ confirmTokenHash: raced.confirmTokenHash, source }))
      .resolves.toBe("ADDRESS_UNAVAILABLE");
    expect((await currentAddress(racer.userId)).label).toBe("current");
  });

  it("cancels by the bearer mailed to the current address, and the confirm link dies with it", async () => {
    const account = await fixtureAccount("cancel");
    const repository = new PostgresEmailChangeRepository(database.pool, fakeAuditHasher);
    const input = requestInput(account, await fixtureGrant(account));
    await repository.request(input);
    await expect(repository.cancelByToken({ cancelTokenHash: input.cancelTokenHash, source }))
      .resolves.toBe("CANCELLED");
    await expect(repository.confirm({ confirmTokenHash: input.confirmTokenHash, source }))
      .resolves.toBe("INVALID");
    expect((await currentAddress(account.userId)).label).toBe("current");
    expect((await auditEvents(account.auditToken, "identity.email_change.cancelled")).map((row) => row.decision))
      .toEqual(["ALLOW"]);
  });

  it("cancels the signed-in owner's pending change from Settings", async () => {
    const account = await fixtureAccount("cancel-own");
    const repository = new PostgresEmailChangeRepository(database.pool, fakeAuditHasher);
    const input = requestInput(account, await fixtureGrant(account));
    await repository.request(input);
    await expect(repository.cancelOwn({ userId: account.userId, sessionId: account.sessionId, source }))
      .resolves.toBe(true);
    await expect(repository.cancelOwn({ userId: account.userId, sessionId: account.sessionId, source }))
      .resolves.toBe(false);
    await expect(repository.confirm({ confirmTokenHash: input.confirmTokenHash, source }))
      .resolves.toBe("INVALID");
  });

  it("supersedes an open change when a new one is requested", async () => {
    const account = await fixtureAccount("supersede");
    const repository = new PostgresEmailChangeRepository(database.pool, fakeAuditHasher);
    const first = requestInput(account, await fixtureGrant(account), "first");
    await repository.request(first);
    const second = requestInput(account, await fixtureGrant(account), "second");
    await repository.request(second);
    await expect(repository.confirm({ confirmTokenHash: first.confirmTokenHash, source }))
      .resolves.toBe("INVALID");
    await expect(repository.confirm({ confirmTokenHash: second.confirmTokenHash, source }))
      .resolves.toBe("CONFIRMED");
    expect((await currentAddress(account.userId)).label).toBe("second");
  });

  it("resends by rotating the confirm bearer and refuses inside the cooldown", async () => {
    const account = await fixtureAccount("resend");
    const repository = new PostgresEmailChangeRepository(database.pool, fakeAuditHasher);
    const input = requestInput(account, await fixtureGrant(account));
    await repository.request(input);
    const rotated = credentialHash("confirm-2");
    const resendInput = {
      userId: account.userId, sessionId: account.sessionId, confirmTokenHash: rotated,
      expiresAt: new Date(Date.now() + 24 * 3_600_000), cooldownMs: 60_000, source
    };
    await expect(repository.resend(resendInput)).resolves.toEqual({ status: "COOLDOWN" });
    await database.pool.query(`
      UPDATE identity.email_change_request SET last_sent_at=now()-interval '2 minutes',
        issued_at=now()-interval '2 minutes' WHERE user_id=$1
    `, [account.userId]);
    await expect(repository.resend(resendInput)).resolves.toEqual({
      status: "RESENT", newEmailCiphertext: envelope("new"), expiresAt: resendInput.expiresAt, addressAvailable: true
    });
    await expect(repository.confirm({ confirmTokenHash: input.confirmTokenHash, source }))
      .resolves.toBe("INVALID");
    await expect(repository.confirm({ confirmTokenHash: rotated, source }))
      .resolves.toBe("CONFIRMED");
    await expect(repository.resend({ ...resendInput, confirmTokenHash: credentialHash("confirm-3") }))
      .resolves.toEqual({ status: "NONE" });
  });

  it("binds every capability to a live session of the same account", async () => {
    const account = await fixtureAccount("session-bound");
    const other = await fixtureAccount("session-bound-other");
    const repository = new PostgresEmailChangeRepository(database.pool, fakeAuditHasher);
    await repository.request(requestInput(account, await fixtureGrant(account)));
    await expect(repository.readSettings({ userId: account.userId, sessionId: other.sessionId })).resolves.toBeNull();
    await expect(repository.cancelOwn({ userId: account.userId, sessionId: other.sessionId, source }))
      .resolves.toBe(false);
    await database.pool.query("UPDATE identity.session SET revoked_at=now() WHERE session_id=$1", [account.sessionId]);
    await expect(repository.readSettings({ userId: account.userId, sessionId: account.sessionId })).resolves.toBeNull();
  });

  it("mints a CHANGE_EMAIL grant through step-up and spends it, both under the authorization role", async () => {
    const account = await fixtureAccount("step-up");
    const client = await database.pool.connect();
    try {
      await client.query("SET ROLE debateai_authorization_runtime");
      const sessions = new PostgresSessionRepository(poolWithHeldClient(client), fakeAuditHasher);
      const changes = new PostgresEmailChangeRepository(poolWithHeldClient(client), fakeAuditHasher);
      const identity: LoginIdentityRecord = Object.freeze({
        userId: account.userId, ownerRef: account.ownerRef, auditToken: account.auditToken,
        passwordHash: FIXTURE_PASSWORD_HASH, factorId: account.factorId,
        secretCiphertext: envelope("totp"), lastAcceptedStep: 10
      });
      const grantTokenHash = credentialHash("minted");
      const rotatedTokenHash = credentialHash("rotated");
      const occurredAt = new Date();
      await expect(sessions.rotateAfterStepUp({
        identity, currentSessionId: account.sessionId, currentTokenHash: account.sessionTokenHash,
        acceptedStep: 11, replacementTokenHash: rotatedTokenHash, replacementCsrfHash: credentialHash("csrf-2"),
        bindingContext: { user_agent_hash: credentialHash("ua") }, occurredAt,
        idleExpiresAt: new Date(occurredAt.getTime() + 60_000), source,
        grant: { grantId: randomUUID(), grantTokenHash, action: "CHANGE_EMAIL",
          expiresAt: new Date(occurredAt.getTime() + 30_000) }
      })).resolves.toBe(true);
      await expect(changes.request(requestInput(account, grantTokenHash)))
        .resolves.toMatchObject({ status: "PENDING", addressAvailable: true });
    } finally {
      await client.query("RESET ROLE");
      client.release();
    }
    const grant = await database.pool.query<{ action: string; target_account_id: string; consumed: boolean }>(`
      SELECT action,target_account_id,consumed_at IS NOT NULL AS consumed
      FROM identity.step_up_grant WHERE session_id=$1
    `, [account.sessionId]);
    expect(grant.rows).toEqual([{ action: "CHANGE_EMAIL", target_account_id: account.userId, consumed: true }]);
  });

  it("keeps the request table behind the capabilities for every runtime role", async () => {
    const privileges = await database.pool.query<{ role: string; table_select: boolean; execute: boolean }>(`
      SELECT role,
        has_table_privilege(role,'identity.email_change_request','SELECT') AS table_select,
        has_function_privilege(role,
          'identity.request_email_change_with_audit(uuid,uuid,text,uuid,bytea,jsonb,text,text,timestamptz,jsonb)',
          'EXECUTE') AS execute
      FROM unnest(ARRAY['debateai_runtime','debateai_authorization_runtime']) AS role
    `);
    expect(privileges.rows).toEqual([
      { role: "debateai_runtime", table_select: false, execute: false },
      { role: "debateai_authorization_runtime", table_select: false, execute: true }
    ]);
  });
});

// NV-12 (0125): one per-account budget of confirmation mails shared by request and resend, a resend that never moves
// the change past its issue time + the link TTL, and thresholds the database checks itself.
describe("NV-12 bounded change-email entry points on real PostgreSQL", () => {
  const LIMITS = Object.freeze({ maximumSends: 3, windowMs: 3_600_000 });
  const LINK_TTL_MS = 24 * 3_600_000;
  const REQUEST_SIGNATURE = "identity.request_email_change_bounded(uuid,uuid,text,uuid,bytea,jsonb,text,text,timestamptz,jsonb,integer,bigint)";
  const RESEND_SIGNATURE = "identity.resend_email_change_bounded(uuid,uuid,text,timestamptz,bigint,jsonb,integer,bigint,bigint)";
  const PREPARED_SOURCE = Object.freeze({
    ipArgon2id: `argon2id-audit:v1:${"11".repeat(32)}`, userAgentArgon2id: `argon2id-audit:v1:${"22".repeat(32)}`
  });
  const bounded = () => new PostgresEmailChangeRepository(authorization, fakeAuditHasher);
  const resendInput = (account: Fixture) => Object.freeze({
    userId: account.userId, sessionId: account.sessionId, confirmTokenHash: credentialHash("confirm-bounded"),
    expiresAt: new Date(Date.now() + LINK_TTL_MS), cooldownMs: 60_000, source, ...LIMITS, linkTtlMs: LINK_TTL_MS
  });
  /** Moves the open change's last mail past the cooldown, so the next resend reaches the clamp and the window. */
  const age = async (account: Fixture) => database.pool.query(`
    UPDATE identity.email_change_request SET last_sent_at=now()-interval '2 minutes',
      issued_at=LEAST(issued_at,now()-interval '2 minutes') WHERE user_id=$1 AND closed_at IS NULL
  `, [account.userId]);
  /** A denial carries a random actor and target (0079), so it is counted by its type and justification. */
  const denials = async (eventType: string, justification: string) => Number((await database.pool.query<{ count: string }>(
    "SELECT count(*) AS count FROM identity.audit_event WHERE event_type=$1 AND justification=$2",
    [eventType, justification])).rows[0]!.count);
  const sendWindow = async (account: Fixture) => (await database.pool.query<{ sends: number; window_started_at: Date }>(
    "SELECT sends,window_started_at FROM identity.email_change_send_window WHERE user_id=$1", [account.userId])).rows[0];
  const unconsumed = async (grant: string) => (await database.pool.query<{ unconsumed: boolean }>(
    "SELECT consumed_at IS NULL AS unconsumed FROM identity.step_up_grant WHERE token_hash=$1", [grant])).rows[0]?.unconsumed;
  /** One direct call as the authorization role, in its own transaction with its own audit attempt, committed. */
  async function direct(sql: string, values: readonly unknown[]): Promise<string | undefined> {
    const client = await authorization.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT identity.begin_runtime_audit_attempt()");
      const status = (await client.query<{ result_status: string }>(sql, [...values])).rows[0]?.result_status;
      await client.query("COMMIT");
      return status;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  it("counts the request's mail and every resend against one budget of three an hour, and restarts it once the hour has passed", async () => {
    const account = await fixtureAccount("bounded-budget");
    const repository = bounded();
    await expect(repository.requestBounded({ ...requestInput(account, await fixtureGrant(account)), ...LIMITS }))
      .resolves.toMatchObject({ status: "PENDING" });
    expect(await sendWindow(account)).toMatchObject({ sends: 1 });
    for (const sends of [2, 3]) {
      await age(account);
      await expect(repository.resendBounded(resendInput(account))).resolves.toMatchObject({ status: "RESENT" });
      expect(await sendWindow(account)).toMatchObject({ sends });
    }
    // The fourth send (the third resend) is refused and counts nothing.
    await age(account);
    const resendLimits = await denials("identity.email_change.resent", "SEND_LIMIT");
    await expect(repository.resendBounded(resendInput(account))).resolves.toEqual({ status: "LIMIT" });
    expect(await denials("identity.email_change.resent", "SEND_LIMIT")).toBe(resendLimits + 1);
    expect(await sendWindow(account)).toMatchObject({ sends: 3 });
    // A fresh step-up does not refresh the budget, and its grant survives the refusal.
    const grant = await fixtureGrant(account);
    const requestLimits = await denials("identity.email_change.requested", "SEND_LIMIT");
    await expect(repository.requestBounded({ ...requestInput(account, grant, "again"), ...LIMITS }))
      .resolves.toEqual({ status: "LIMIT" });
    expect(await denials("identity.email_change.requested", "SEND_LIMIT")).toBe(requestLimits + 1);
    expect(await unconsumed(grant)).toBe(true);
    expect(await sendWindow(account)).toMatchObject({ sends: 3 });
    // Once the window is an hour old, the next counted send starts a new one.
    await database.pool.query(
      "UPDATE identity.email_change_send_window SET window_started_at=now()-interval '61 minutes' WHERE user_id=$1",
      [account.userId]);
    await age(account);
    await expect(repository.resendBounded(resendInput(account))).resolves.toMatchObject({ status: "RESENT" });
    const restarted = await sendWindow(account);
    expect(restarted?.sends).toBe(1);
    expect(Math.abs(restarted!.window_started_at.getTime() - Date.now())).toBeLessThan(60_000);
    expect((await auditEvents(account.auditToken, "identity.email_change.resent")).map((row) => row.decision))
      .toEqual(["ALLOW", "ALLOW", "ALLOW"]);
  });

  it("clamps a resend to the change's issue time + the link TTL, and answers NONE once that has passed", async () => {
    const account = await fixtureAccount("bounded-clamp");
    const repository = bounded();
    await expect(repository.requestBounded({ ...requestInput(account, await fixtureGrant(account)), ...LIMITS }))
      .resolves.toMatchObject({ status: "PENDING" });
    await database.pool.query(`
      UPDATE identity.email_change_request SET issued_at=now()-interval '23 hours',last_sent_at=now()-interval '2 minutes'
      WHERE user_id=$1 AND closed_at IS NULL
    `, [account.userId]);
    const issuedAt = (await database.pool.query<{ issued_at: Date }>(
      "SELECT issued_at FROM identity.email_change_request WHERE user_id=$1 AND closed_at IS NULL",
      [account.userId])).rows[0]!.issued_at;
    const clamped = await repository.resendBounded(resendInput(account));
    expect(clamped).toMatchObject({ status: "RESENT" });
    if (clamped.status !== "RESENT") throw new Error("unreachable");
    expect(clamped.expiresAt.getTime()).toBe(issuedAt.getTime() + LINK_TTL_MS);
    expect(await sendWindow(account)).toMatchObject({ sends: 2 });
    // That resend set last_sent_at to now: age it again, then put the issue time 25 hours back (expires_at stays ahead).
    await database.pool.query(`
      UPDATE identity.email_change_request SET last_sent_at=now()-interval '2 minutes',issued_at=now()-interval '25 hours'
      WHERE user_id=$1 AND closed_at IS NULL
    `, [account.userId]);
    const lapsed = await denials("identity.email_change.resent", "PENDING_CHANGE_LAPSED");
    await expect(repository.resendBounded(resendInput(account))).resolves.toEqual({ status: "NONE" });
    expect(await denials("identity.email_change.resent", "PENDING_CHANGE_LAPSED")).toBe(lapsed + 1);
    expect(await sendWindow(account)).toMatchObject({ sends: 2 });
  });

  it("keeps 0099's 720-hour session ceiling on the bounded resend", async () => {
    const account = await fixtureAccount("bounded-ceiling");
    const repository = bounded();
    await expect(repository.requestBounded({ ...requestInput(account, await fixtureGrant(account)), ...LIMITS }))
      .resolves.toMatchObject({ status: "PENDING" });
    // The session's absolute expiry stays a week ahead; only its age passes the ceiling.
    await database.pool.query("UPDATE identity.session SET created_at=now()-interval '721 hours' WHERE session_id=$1",
      [account.sessionId]);
    await age(account);
    const noPending = await denials("identity.email_change.resent", "NO_PENDING_CHANGE");
    await expect(repository.resendBounded(resendInput(account))).resolves.toEqual({ status: "NONE" });
    expect(await denials("identity.email_change.resent", "NO_PENDING_CHANGE")).toBe(noPending + 1);
    expect(await sendWindow(account)).toMatchObject({ sends: 1 });
  });

  it("refuses a missing or out-of-range threshold with REQUEST_INVALID and its audit", async () => {
    const account = await fixtureAccount("bounded-thresholds");
    const grant = await fixtureGrant(account);
    const input = requestInput(account, grant);
    const request = (maximumSends: number | null, windowMs: number | null) => direct(
      "SELECT * FROM identity.request_email_change_bounded($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb,$11::integer,$12::bigint)",
      [input.userId, input.sessionId, input.grantTokenHash, randomUUID(), input.newEmailBlindIndex,
        JSON.stringify(input.newEmailCiphertext), input.confirmTokenHash, input.cancelTokenHash, input.expiresAt,
        JSON.stringify(PREPARED_SOURCE), maximumSends, windowMs]);
    for (const [maximumSends, windowMs] of [[null, 3_600_000], [0, 3_600_000], [4, 3_600_000], [3, null], [3, 59_999], [3, 86_400_001]] as const) {
      const before = await denials("identity.email_change.requested", "REQUEST_INVALID");
      await expect(request(maximumSends, windowMs), `request ${maximumSends}/${windowMs}`).resolves.toBe("DENIED");
      expect(await denials("identity.email_change.requested", "REQUEST_INVALID")).toBe(before + 1);
    }
    expect(await unconsumed(grant)).toBe(true);
    expect(await sendWindow(account)).toBeUndefined();
    const resend = (maximumSends: number | null, windowMs: number | null, linkTtlMs: number | null) => direct(
      "SELECT * FROM identity.resend_email_change_bounded($1,$2,$3,$4,$5,$6::jsonb,$7::integer,$8::bigint,$9::bigint)",
      [account.userId, account.sessionId, credentialHash("confirm-direct"), new Date(Date.now() + LINK_TTL_MS), 60_000,
        JSON.stringify(PREPARED_SOURCE), maximumSends, windowMs, linkTtlMs]);
    for (const [maximumSends, windowMs, linkTtlMs] of [
      [null, 3_600_000, LINK_TTL_MS], [0, 3_600_000, LINK_TTL_MS], [4, 3_600_000, LINK_TTL_MS],
      [3, null, LINK_TTL_MS], [3, 59_999, LINK_TTL_MS], [3, 86_400_001, LINK_TTL_MS],
      [3, 3_600_000, null], [3, 3_600_000, 0], [3, 3_600_000, 90_000_001]
    ] as const) {
      const before = await denials("identity.email_change.resent", "REQUEST_INVALID");
      await expect(resend(maximumSends, windowMs, linkTtlMs), `resend ${maximumSends}/${windowMs}/${linkTtlMs}`).resolves.toBe("NONE");
      expect(await denials("identity.email_change.resent", "REQUEST_INVALID")).toBe(before + 1);
    }
    // Control: the same direct call with valid thresholds opens the change, so only the thresholds were refused.
    await expect(request(3, 3_600_000)).resolves.toBe("PENDING");
    expect(await unconsumed(grant)).toBe(false);
    expect(await sendWindow(account)).toMatchObject({ sends: 1 });
  });

  it("grants both entry points to the authorization role only and keeps the window table behind them", async () => {
    const execute = await database.pool.query<{ role: string; request: boolean; resend: boolean }>(`
      SELECT role,has_function_privilege(role,$1,'EXECUTE') AS request,has_function_privilege(role,$2,'EXECUTE') AS resend
      FROM unnest(ARRAY['debateai_runtime','debateai_authorization_runtime','debateai_erasure_runtime']) AS role
    `, [REQUEST_SIGNATURE, RESEND_SIGNATURE]);
    expect(execute.rows).toEqual([
      { role: "debateai_runtime", request: false, resend: false },
      { role: "debateai_authorization_runtime", request: true, resend: true },
      { role: "debateai_erasure_runtime", request: false, resend: false }
    ]);
    const publicExecute = await database.pool.query<{ signature: string; public: boolean }>(`
      SELECT signature,EXISTS(SELECT 1 FROM pg_proc p,aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        WHERE p.oid=to_regprocedure(signature) AND a.grantee=0) AS public
      FROM unnest($1::text[]) AS signature ORDER BY signature
    `, [[REQUEST_SIGNATURE, RESEND_SIGNATURE]]);
    expect(publicExecute.rows.map((row) => row.public)).toEqual([false, false]);
    const table = await database.pool.query<{ others: number; guarded: boolean; selectable: boolean }>(`
      SELECT (SELECT count(*)::int FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee<>c.relowner) AS others,
        EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=c.oid AND t.tgname='reject_truncate' AND NOT t.tgisinternal) AS guarded,
        has_table_privilege('debateai_authorization_runtime',c.oid,'SELECT') AS selectable
      FROM pg_class c WHERE c.oid='identity.email_change_send_window'::regclass
    `);
    expect(table.rows).toEqual([{ others: 0, guarded: true, selectable: false }]);
  });
});
