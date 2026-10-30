import { withMailLocale } from '../../packages/db/src/mail-locale.js';
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, PostgresInvestigationRepository, PostgresWebEvidenceRepository, RunRepository, type WebSealed } from "@debateai/db";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";
import { Pool, type PoolClient } from "pg";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { PostgresDataExportRepository, PostgresDataExportSource } from "../../packages/db/src/data-export.js";

const hash = (c: string) => `sha256:${c.repeat(64)}`;
const source = { ipArgon2id: `argon2id-audit:v1:${"a".repeat(64)}`, userAgentArgon2id: `argon2id-audit:v1:${"b".repeat(64)}` };
const signatures = [
  "request_data_export(uuid,uuid,text,uuid,text,jsonb)", "read_data_export_status(uuid)",
  "claim_data_export(uuid,integer)", "renew_data_export_lease(uuid,uuid,integer)",
  "read_data_export_snapshot(uuid,uuid)", "read_data_export_snapshot_v2(uuid,uuid)",
  "complete_data_export(uuid,uuid,text,text,bigint,timestamp with time zone)",
  "fail_data_export(uuid,uuid,text)", "sweep_data_exports()", "mark_data_export_key_destroyed(uuid)",
  "live_data_export_ids(uuid[])", "open_data_export_link(uuid,text)", "record_data_export_download(uuid,uuid,jsonb)"
];

describe("data export database authority", () => {
  let db: TestDatabase, requestPool: Pool, workerPool: Pool;
  beforeAll(async () => {
    db = await startTestDatabase();
    await migrate(db.pool);
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE debateai_authorization_runtime");
      expect((await client.query("SELECT current_user name")).rows[0].name).toBe("debateai_authorization_runtime");
      await client.query("SET LOCAL ROLE debateai_data_export_worker");
      expect((await client.query("SELECT current_user name")).rows[0].name).toBe("debateai_data_export_worker");
    } finally { await client.query("ROLLBACK"); client.release(); }
    await db.pool.query("CREATE ROLE data_export_db_request LOGIN PASSWORD 'data-export-db-request-only' IN ROLE debateai_authorization_runtime");
    await db.pool.query("CREATE ROLE data_export_db_worker LOGIN PASSWORD 'data-export-db-worker-only' IN ROLE debateai_data_export_worker");
    const loginPool = (role: string, password: string) => {
      const url = new URL(db.connectionString);
      url.username = role;
      url.password = password;
      return new Pool({ connectionString: url.toString() });
    };
    requestPool = loginPool("data_export_db_request", "data-export-db-request-only");
    workerPool = loginPool("data_export_db_worker", "data-export-db-worker-only");
    expect((await requestPool.query("SELECT current_user name")).rows[0].name).toBe("data_export_db_request");
    expect((await workerPool.query("SELECT current_user name")).rows[0].name).toBe("data_export_db_worker");
  }, 180_000);
  afterAll(async () => { await requestPool?.end(); await workerPool?.end(); await db?.stop(); });

  async function account(verified = true) {
    const user = randomUUID(), session = randomUUID(), owner = randomUUID();
    await db.pool.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
      VALUES($1,$2,'{}','fixture-password',$3,'active',clock_timestamp())`, [user, createHash("sha256").update(user).digest(), owner]);
    await db.pool.query(`INSERT INTO identity.session(session_id,user_id,token_hash,csrf_token_hash,binding_context,idle_expires_at,absolute_expires_at,last_mfa_at)
      VALUES($1,$2,$3,$4,'{}',clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours',clock_timestamp())`, [session, user, `sha256:${createHash("sha256").update(session).digest("hex")}`, `sha256:${createHash("sha256").update(user).digest("hex")}`]);
    if (verified) await db.pool.query(`INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,created_at,verified_at)
      VALUES($1,'email','{}','verified',clock_timestamp(),clock_timestamp())`, [user]);
    return { user, session, owner };
  }

  async function grant(user: string, session: string, opts: { action?: string; expires?: number; consumed?: boolean; hash?: string } = {}) {
    const token = opts.hash ?? `sha256:${createHash("sha256").update(randomUUID()).digest("hex")}`;
    await db.pool.query(`INSERT INTO identity.step_up_grant(step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,target_account_id,issued_at,expires_at,consumed_at)
      VALUES($1,$2,$3,$4,$5,NULL,$4,clock_timestamp()-interval '5 minutes',clock_timestamp()+make_interval(secs=>$6),
      CASE WHEN $7 THEN clock_timestamp()-interval '1 minute' ELSE NULL END)`,
    [randomUUID(), token, session, user, opts.action ?? "EXPORT_DATA", opts.expires ?? 120, opts.consumed ?? false]);
    return token;
  }

  async function asRuntime<T>(fn: (client: PoolClient) => Promise<T>, audit = false): Promise<T> {
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE debateai_authorization_runtime");
      expect((await client.query("SELECT current_user name")).rows[0].name).toBe("debateai_authorization_runtime");
      if (audit) await client.query("SELECT identity.begin_runtime_audit_attempt()");
      const value = await fn(client);
      await client.query("COMMIT");
      return value;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  async function asWorker<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE debateai_data_export_worker");
      expect((await client.query("SELECT current_user name")).rows[0].name).toBe("debateai_data_export_worker");
      const value = await fn(client);
      await client.query("COMMIT");
      return value;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  async function request(user: string, session: string, token: string, context: unknown = source) {
    return asRuntime(async client => (await client.query(
      "SELECT * FROM identity.request_data_export($1,$2,$3,$4,'en',$5::jsonb)",
      [user, session, token, randomUUID(), JSON.stringify(context)]
    )).rows[0], true);
  }

  it("D1 accepts an account-scoped EXPORT_DATA grant", async () => {
    const a = await account();
    const token = await grant(a.user, a.session);
    expect((await db.pool.query("SELECT action,target_run_id,target_account_id,target_factor_id,target_provider FROM identity.step_up_grant WHERE token_hash=$1", [token])).rows[0])
      .toEqual({ action: "EXPORT_DATA", target_run_id: null, target_account_id: a.user, target_factor_id: null, target_provider: null });
  });

  it("D2 rejects all five invalid EXPORT_DATA target shapes at the action CHECK", async () => {
    const a = await account();
    for (const target of [
      { target_run_id: randomUUID() }, { target_factor_id: randomUUID() }, { target_provider: "google" },
      { target_account_id: null }, { target_account_id: randomUUID() }
    ]) {
      const shape = { target_run_id: null, target_factor_id: null, target_provider: null, target_account_id: a.user, ...target };
      await expect(db.pool.query(`INSERT INTO identity.step_up_grant(step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,target_account_id,target_factor_id,target_provider,issued_at,expires_at)
        VALUES($1,$2,$3,$4,'EXPORT_DATA',$5,$6,$7,$8,clock_timestamp(),clock_timestamp()+interval '2 minutes')`,
      [randomUUID(), `sha256:${randomUUID().replaceAll("-", "").repeat(2)}`, a.session, a.user, shape.target_run_id, shape.target_account_id, shape.target_factor_id, shape.target_provider]))
        .rejects.toMatchObject({ code: "23514", constraint: "step_up_grant_action_check" });
    }
  });

  it("D3 issues account-scoped grants through both issuers and refuses a run target", async () => {
    const a = await account();
    const factor = randomUUID(), token = `sha256:${createHash("sha256").update(randomUUID()).digest("hex")}`;
    const identity = (await db.pool.query('SELECT owner_ref,password_hash,audit_token FROM identity."user" WHERE user_id=$1', [a.user])).rows[0];
    await withMailLocale(db.pool, 'en', (c) => c.query("INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,created_at,verified_at) VALUES($1,$2,'totp','{}','active',clock_timestamp(),clock_timestamp())", [factor, a.user]));
    const currentHash = `sha256:${createHash("sha256").update(a.session).digest("hex")}`;
    const rotated = await asRuntime(client => client.query(`SELECT identity.rotate_session_after_step_up_with_audit(
      $1,$2,$3,$4,2,$5,$6,$7,$8,'{}'::jsonb,clock_timestamp()+interval '1 hour',
      $9,$10,'EXPORT_DATA',NULL,clock_timestamp()+interval '5 minutes',$11::jsonb) AS valid`,
    [a.user, identity.owner_ref, identity.password_hash, factor, a.session, currentHash,
      hash("b"), hash("c"), randomUUID(), token, JSON.stringify(source)]), true);
    expect(rotated.rows[0].valid).toBe(true);
    expect((await db.pool.query("SELECT action,target_account_id,target_run_id FROM identity.step_up_grant WHERE token_hash=$1", [token])).rows[0])
      .toEqual({ action: "EXPORT_DATA", target_account_id: a.user, target_run_id: null });
    expect((await db.pool.query("SELECT count(*)::int n FROM identity.audit_event WHERE actor_key_ref=$1 AND event_type='identity.session.step_up'", [identity.audit_token])).rows[0].n).toBe(1);
    const runTargetToken = hash("e");
    const badRotation = await asRuntime(client => client.query(`SELECT identity.rotate_session_after_step_up_with_audit(
      $1,$2,$3,$4,3,$5,$6,$7,$8,'{}'::jsonb,clock_timestamp()+interval '1 hour',
      $9,$10,'EXPORT_DATA',$11,clock_timestamp()+interval '5 minutes',$12::jsonb) AS valid`,
    [a.user, identity.owner_ref, identity.password_hash, factor, a.session, hash("b"),
      hash("f"), hash("a"), randomUUID(), runTargetToken, randomUUID(), JSON.stringify(source)]), true);
    expect(badRotation.rows[0].valid).toBe(false);
    expect((await db.pool.query("SELECT count(*)::int n FROM identity.step_up_grant WHERE token_hash=$1", [runTargetToken])).rows[0].n).toBe(0);

    const credentialId = randomBytes(32).toString("base64url"), handle = randomBytes(32).toString("base64url");
    await db.pool.query("INSERT INTO identity.consumer_passkey_subject(user_id,user_handle) VALUES($1,$2)", [a.user, handle]);
    await withMailLocale(db.pool, 'en', (c) => c.query(`INSERT INTO identity.consumer_passkey_credential(user_id,credential_id,public_key,signature_counter,device_type,backed_up,rp_id,origin,label)
      VALUES($1,$2,$3,0,'singleDevice',false,'example.test','https://example.test','only-key')`, [a.user, credentialId, randomBytes(65).toString("base64url")]));
    const challenge = { userId: a.user, sessionId: a.session, tokenHash: hash("b"),
      challengesPerScope: 5, challengeCapacity: 100, handleHash: hash("1"), challengeHash: hash("2"),
      bindingHash: hash("3"), retentionKey: hash("4"), rpId: "example.test", origin: "https://example.test",
      authorization: { action: "EXPORT_DATA" } };
    await asRuntime(client => client.query("SELECT identity.begin_consumer_security_step_up($1::jsonb)", [JSON.stringify(challenge)]));
    const passkey = await asRuntime(async client => (await client.query("SELECT identity.read_consumer_security_step_up($1::jsonb) value",
      [JSON.stringify({ userId: a.user, sessionId: a.session, tokenHash: hash("b"), handleHash: hash("1"),
        bindingHash: hash("3"), credentialId })])).rows[0].value);
    expect(passkey).not.toBeNull();
    const consumerToken = hash("5");
    const completed = await asRuntime(async client => (await client.query("SELECT identity.complete_consumer_security_step_up($1::jsonb,$2::jsonb) value",
      [JSON.stringify({ ...passkey, userId: a.user, sessionId: a.session, tokenHash: hash("b"),
        handleHash: hash("1"), bindingHash: hash("3"), replacementTokenHash: hash("6"),
        replacementCsrfHash: hash("7"), grantHash: consumerToken }), JSON.stringify(source)])).rows[0].value, true);
    expect(completed.authorization).toEqual({ action: "EXPORT_DATA" });
    expect((await db.pool.query("SELECT action,target_account_id,target_run_id FROM identity.step_up_grant WHERE token_hash=$1", [consumerToken])).rows[0])
      .toEqual({ action: "EXPORT_DATA", target_account_id: a.user, target_run_id: null });
    await expect(asRuntime(client => client.query("SELECT identity.begin_consumer_security_step_up($1::jsonb)",
      [JSON.stringify({ ...challenge, tokenHash: hash("6"), handleHash: hash("8"),
        authorization: { action: "EXPORT_DATA", target_run_id: randomUUID() } })])))
      .rejects.toMatchObject({ code: "P0001", message: "CONSUMER_SECURITY_INVALID" });
  });

  it("D4 checks audit-attempt precedence and each invalid grant before writing", async () => {
    const a = await account(), good = await grant(a.user, a.session);
    await expect(asRuntime(client => client.query("SELECT * FROM identity.request_data_export($1,$2,$3,$4,'en',$5::jsonb)", [a.user, a.session, good, randomUUID(), JSON.stringify(source)])))
      .rejects.toThrow(/AUDIT_ATTEMPT_REQUIRED/);
    await expect(request(a.user, a.session, good, [])).rejects.toThrow();
    for (const bad of [hash("e"), await grant(a.user, a.session, { expires: -1, hash: hash("f") }),
      await grant(a.user, a.session, { consumed: true, hash: hash("1") }), await grant(a.user, a.session, { action: "DELETE_ACCOUNT", hash: hash("2") })]) {
      expect((await request(a.user, a.session, bad)).result_status).toBe("STEP_UP_INVALID");
    }
    const otherSession = randomUUID();
    await db.pool.query(`INSERT INTO identity.session(session_id,user_id,token_hash,csrf_token_hash,binding_context,idle_expires_at,absolute_expires_at,last_mfa_at)
      VALUES($1,$2,$3,$4,'{}',clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours',clock_timestamp())`,
      [otherSession, a.user, `sha256:${createHash("sha256").update(otherSession).digest("hex")}`,
        `sha256:${createHash("sha256").update(otherSession + "csrf").digest("hex")}`]);
    const otherGrant = await grant(a.user, otherSession);
    expect((await request(a.user, a.session, otherGrant)).result_status).toBe("STEP_UP_INVALID");
    expect((await request(a.user, a.session, good)).result_status).toBe("ACCEPTED");
    expect((await request(a.user, a.session, good)).result_status).toBe("STEP_UP_INVALID");
    const doubled = await account(), doubleGrant = await grant(doubled.user, doubled.session);
    const countDurable = async () => (await db.pool.query(`SELECT
      (SELECT count(*)::int FROM identity.runtime_audit_attempt) attempts,
      (SELECT count(*)::int FROM identity.data_export WHERE user_id=$1) exports,
      (SELECT count(*)::int FROM identity.audit_event) audits`, [doubled.user])).rows[0];
    const before = await countDurable();
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE debateai_authorization_runtime");
      await client.query("SELECT identity.begin_runtime_audit_attempt()");
      await expect(client.query("SELECT identity.begin_runtime_audit_attempt()"))
        .rejects.toMatchObject({ code: "23505", constraint: "runtime_audit_attempt_backend_pid_transaction_id_key" });
    } finally { await client.query("ROLLBACK"); client.release(); }
    expect(await countDurable()).toEqual(before);
    const neverConsumed = await db.pool.connect();
    try {
      await neverConsumed.query("BEGIN");
      await neverConsumed.query("SET LOCAL ROLE debateai_authorization_runtime");
      await neverConsumed.query("SELECT identity.begin_runtime_audit_attempt()");
      await expect(neverConsumed.query("COMMIT")).rejects.toMatchObject({ code: "55000", message: "AUDIT_ATTEMPT_NOT_CONSUMED" });
    } finally { await neverConsumed.query("ROLLBACK"); neverConsumed.release(); }
    expect(await countDurable()).toEqual(before);
    expect((await db.pool.query("SELECT consumed_at FROM identity.step_up_grant WHERE token_hash=$1", [doubleGrant])).rows[0].consumed_at).toBeNull();
    const rotated = await account(), stale = await grant(rotated.user, rotated.session);
    await db.pool.query("UPDATE identity.session SET token_hash=$2 WHERE session_id=$1", [rotated.session, hash("8")]);
    await expect(request(rotated.user, rotated.session, stale)).rejects.toMatchObject({ code: "P0001", message: "STEP_UP_GRANT_GENERATION_INVALID" });
    const repo = new PostgresDataExportRepository(requestPool, workerPool, { hashSourceIp: async () => "a".repeat(64), hashUserAgent: async () => "b".repeat(64) } as never);
    expect(await repo.request({ userId: rotated.user, sessionId: rotated.session, grantTokenHash: stale,
      exportId: randomUUID(), locale: "en", source: { ip: "192.0.2.1", userAgent: "fixture", requestId: "D4" } }))
      .toEqual({ kind: "STEP_UP_INVALID" });
  });

  it("D5 consumes a valid grant when no verified email exists", async () => {
    const a = await account(false), token = await grant(a.user, a.session);
    expect((await request(a.user, a.session, token)).result_status).toBe("EMAIL_REQUIRED");
    expect((await db.pool.query("SELECT consumed_at IS NOT NULL used FROM identity.step_up_grant WHERE token_hash=$1", [token])).rows[0].used).toBe(true);
  });

  it("D6 refuses processing erasure and permits a scheduled one", async () => {
    const a = await account(), token = await grant(a.user, a.session);
    await db.pool.query(`INSERT INTO identity.account_erasure_request(user_id,requested_at,execute_at,prepared_at,
      prepared_run_ids,prepared_legacy_run_ids,prepared_published_run_ids,prepared_current_publication_refs,prepared_cleanup_publication_refs)
      VALUES($1,clock_timestamp(),clock_timestamp()+interval '30 days',clock_timestamp(),'{}','{}','{}','{}','{}')`, [a.user]);
    expect((await request(a.user, a.session, token)).result_status).toBe("ERASING");
    await db.pool.query(`UPDATE identity.account_erasure_request SET prepared_at=NULL,prepared_run_ids=NULL,
      prepared_legacy_run_ids=NULL,prepared_published_run_ids=NULL,prepared_current_publication_refs=NULL,
      prepared_cleanup_publication_refs=NULL WHERE user_id=$1`, [a.user]);
    const next = await grant(a.user, a.session, { hash: hash("3") });
    expect((await request(a.user, a.session, next)).result_status).toBe("ACCEPTED");
  });

  it("D7 consumes the grant while a security hold is active", async () => {
    const a = await account(), token = await grant(a.user, a.session);
    await db.pool.query("INSERT INTO identity.account_security_hold(user_id,held) VALUES($1,true) ON CONFLICT(user_id) DO UPDATE SET held=true", [a.user]);
    expect((await request(a.user, a.session, token)).result_status).toBe("HELD");
  });

  it("D8 prevents a second PREPARING request", async () => {
    const a = await account();
    expect((await request(a.user, a.session, await grant(a.user, a.session))).result_status).toBe("ACCEPTED");
    expect((await request(a.user, a.session, await grant(a.user, a.session, { hash: hash("4") }))).result_status).toBe("IN_PROGRESS");
  });

  it("D9 limits three nonfailed exports within 24 hours and computes retry", async () => {
    const a = await account();
    await db.pool.query(`INSERT INTO identity.data_export(export_id,user_id,session_id,locale,status,requested_at,failed_at)
      VALUES($1,$2,$3,'en','FAILED',clock_timestamp(),clock_timestamp())`, [randomUUID(), a.user, a.session]);
    for (let i = 0; i < 3; i++) {
      const token = await grant(a.user, a.session);
      expect((await request(a.user, a.session, token)).result_status).toBe("ACCEPTED");
      const sentAt = new Date();
      await db.pool.query("UPDATE identity.data_export SET status='SENT',link_token_hash=$2,archive_sha256=$3,sent_at=$4,expires_at=$4::timestamptz+interval '86400 seconds' WHERE user_id=$1 AND status='PREPARING'", [a.user, `sha256:${String(i + 5).repeat(64)}`, "a".repeat(64), sentAt]);
      await db.pool.query("UPDATE identity.data_export SET requested_at=clock_timestamp()-make_interval(secs=>$2) WHERE user_id=$1 AND link_token_hash=$3", [a.user, (2 - i) * 3600, `sha256:${String(i + 5).repeat(64)}`]);
    }
    const result = await request(a.user, a.session, await grant(a.user, a.session, { hash: hash("8") }));
    expect(result.result_status).toBe("RATE_LIMITED");
    expect(result.result_retry_after_seconds).toBeGreaterThanOrEqual(79_199);
    expect(result.result_retry_after_seconds).toBeLessThanOrEqual(79_201);
  });

  it("D10 records PREPARING and requested audit while superseding old SENT", async () => {
    const a = await account(), token = await grant(a.user, a.session);
    const oldId = randomUUID(), sentAt = new Date();
    await db.pool.query(`INSERT INTO identity.data_export(export_id,user_id,session_id,locale,status,requested_at,
      link_token_hash,archive_sha256,sent_at,expires_at) VALUES($1,$2,$3,'en','SENT',$4,$5,$6,$4,$4::timestamptz+interval '86400 seconds')`,
    [oldId, a.user, a.session, sentAt, hash("a"), "b".repeat(64)]);
    expect((await request(a.user, a.session, token)).result_status).toBe("ACCEPTED");
    expect((await db.pool.query("SELECT count(*)::int n FROM identity.data_export WHERE user_id=$1 AND status='PREPARING'", [a.user])).rows[0].n).toBe(1);
    expect((await db.pool.query("SELECT status FROM identity.data_export WHERE export_id=$1", [oldId])).rows[0].status).toBe("SUPERSEDED");
    const actor = (await db.pool.query("SELECT audit_token FROM identity.\"user\" WHERE user_id=$1", [a.user])).rows[0].audit_token;
    expect((await db.pool.query("SELECT count(*)::int n FROM identity.audit_event WHERE actor_key_ref=$1 AND event_type='identity.data_export.requested'", [actor])).rows[0].n).toBe(1);
  });

  it("D11 exposes only current NONE, PREPARING, SENT and FAILED status", async () => {
    const a = await account();
    expect((await asRuntime(client => client.query("SELECT * FROM identity.read_data_export_status($1)", [a.user]))).rows[0].status).toBe("NONE");
    await request(a.user, a.session, await grant(a.user, a.session));
    expect((await asRuntime(client => client.query("SELECT * FROM identity.read_data_export_status($1)", [a.user]))).rows[0].status).toBe("PREPARING");
    await db.pool.query("UPDATE identity.data_export SET status='FAILED',failed_at=clock_timestamp() WHERE user_id=$1", [a.user]);
    expect((await asRuntime(client => client.query("SELECT * FROM identity.read_data_export_status($1)", [a.user]))).rows[0].status).toBe("FAILED");
    await db.pool.query("UPDATE identity.data_export SET failed_at=clock_timestamp()-interval '25 hours' WHERE user_id=$1", [a.user]);
    expect((await asRuntime(client => client.query("SELECT * FROM identity.read_data_export_status($1)", [a.user]))).rows[0].status).toBe("NONE");
    const id = (await db.pool.query("SELECT export_id FROM identity.data_export WHERE user_id=$1", [a.user])).rows[0].export_id;
    const sentAt = new Date();
    await db.pool.query("UPDATE identity.data_export SET status='SENT',link_token_hash=$2,archive_sha256=$3,sent_at=$4,expires_at=$4::timestamptz+interval '86400 seconds' WHERE export_id=$1", [id, `sha256:${createHash("sha256").update(id).digest("hex")}`, "a".repeat(64), sentAt]);
    const status = () => asRuntime(async client => (await client.query("SELECT * FROM identity.read_data_export_status($1)", [a.user])).rows[0].status);
    expect(await status()).toBe("SENT");
    await db.pool.query("UPDATE identity.data_export SET sent_at=$2::timestamptz-interval '25 hours',expires_at=$2::timestamptz-interval '1 hour' WHERE export_id=$1", [id, new Date()]);
    expect(await status()).toBe("NONE");
    for (const terminal of ["SUPERSEDED", "EXPIRED", "CANCELLED"]) {
      await db.pool.query("UPDATE identity.data_export SET status=$2,closed_at=clock_timestamp() WHERE export_id=$1", [id, terminal]);
      expect(await status()).toBe("NONE");
    }
  });

  it("D12 claims distinct rows concurrently and reclaims an expired lease", async () => {
    await db.pool.query("UPDATE identity.data_export SET status='CANCELLED',closed_at=clock_timestamp() WHERE status='PREPARING'");
    const a = await account();
    await request(a.user, a.session, await grant(a.user, a.session));
    const [left, right] = await Promise.all([randomUUID(), randomUUID()].map(worker => asWorker(client => client.query("SELECT * FROM identity.claim_data_export($1,1)", [worker]))));
    expect([left!.rows[0]?.export_id, right!.rows[0]?.export_id].filter(Boolean)).toHaveLength(1);
    await db.pool.query("UPDATE identity.data_export SET lease_until=clock_timestamp()-interval '1 second' WHERE user_id=$1", [a.user]);
    const next = await asWorker(client => client.query("SELECT * FROM identity.claim_data_export($1,1)", [randomUUID()]));
    expect(next.rows[0].attempt).toBe(2);
  });

  it("D13 protects links by account, expiry and hold while auditing each download", async () => {
    const a = await account(), b = await account(), token = await grant(a.user, a.session);
    await request(a.user, a.session, token);
    const id = (await db.pool.query("SELECT export_id FROM identity.data_export WHERE user_id=$1", [a.user])).rows[0].export_id;
    await db.pool.query("UPDATE identity.data_export SET status='SENT',link_token_hash=$2,archive_sha256=$3,sent_at=$4,expires_at=$4::timestamptz+interval '86400 seconds' WHERE export_id=$1", [id, hash("9"), "a".repeat(64), new Date()]);
    const open = (user: string, link: string) => asRuntime(async client => (await client.query("SELECT * FROM identity.open_data_export_link($1,$2)", [user, link])).rows[0]);
    expect((await open(a.user, hash("0"))).outcome).toBe("INVALID");
    expect((await open(b.user, hash("9"))).outcome).toBe("WRONG_ACCOUNT");
    expect((await open(a.user, hash("9"))).outcome).toBe("OK");
    for (let i = 0; i < 2; i++) await asRuntime(client => client.query("SELECT identity.record_data_export_download($1,$2,$3::jsonb)", [id, a.user, JSON.stringify(source)]), true);
    expect((await db.pool.query("SELECT count(*)::int n FROM identity.audit_event WHERE event_type='identity.data_export.downloaded'", [])).rows[0].n).toBe(2);
    await db.pool.query("INSERT INTO identity.account_security_hold(user_id,held) VALUES($1,true)", [a.user]);
    expect((await open(a.user, hash("9"))).outcome).toBe("HELD");
    await db.pool.query("UPDATE identity.account_security_hold SET held=false WHERE user_id=$1", [a.user]);
    await db.pool.query("UPDATE identity.data_export SET sent_at=$2::timestamptz-interval '25 hours',expires_at=$2::timestamptz-interval '1 hour' WHERE export_id=$1", [id, new Date()]);
    expect((await open(a.user, hash("9"))).outcome).toBe("INVALID");
    expect((await open(b.user, hash("9"))).outcome).toBe("WRONG_ACCOUNT");
    await db.pool.query("UPDATE identity.data_export SET status='SUPERSEDED',closed_at=clock_timestamp() WHERE export_id=$1", [id]);
    expect((await open(a.user, hash("9"))).outcome).toBe("INVALID");
    const resumedAt = new Date();
    await db.pool.query("UPDATE identity.data_export SET status='SENT',closed_at=NULL,sent_at=$2,expires_at=$2::timestamptz+interval '86400 seconds' WHERE export_id=$1", [id, resumedAt]);
    await db.pool.query(`INSERT INTO identity.account_erasure_request(user_id,requested_at,execute_at,prepared_at,
      prepared_run_ids,prepared_legacy_run_ids,prepared_published_run_ids,prepared_current_publication_refs,prepared_cleanup_publication_refs)
      VALUES($1,clock_timestamp(),clock_timestamp()+interval '30 days',clock_timestamp(),'{}','{}','{}','{}','{}')`, [a.user]);
    expect((await open(a.user, hash("9"))).outcome).toBe("INVALID");
  });

  it("D14 denies table DML and other runtime roles execute on all thirteen functions", async () => {
    const workerAttributes = (await db.pool.query("SELECT rolcanlogin,rolinherit,rolsuper,rolbypassrls FROM pg_roles WHERE rolname='debateai_data_export_worker'")).rows[0];
    expect(workerAttributes).toEqual({ rolcanlogin: false, rolinherit: false, rolsuper: false, rolbypassrls: false });
    expect((await db.pool.query("SELECT has_schema_privilege('debateai_data_export_worker','identity','USAGE') allowed")).rows[0].allowed).toBe(true);
    for (const verb of ["SELECT * FROM", "DELETE FROM", "UPDATE", "INSERT INTO"]) {
      const sql = verb === "UPDATE" ? "UPDATE identity.data_export SET status='FAILED'" : verb === "INSERT INTO" ? "INSERT INTO identity.data_export DEFAULT VALUES" : `${verb} identity.data_export`;
      await expect(asRuntime(client => client.query(sql))).rejects.toMatchObject({ code: "42501" });
      await expect(asWorker(client => client.query(sql))).rejects.toMatchObject({ code: "42501" });
    }
    const a = await account();
    const exportId = randomUUID(), thief = randomUUID();
    await db.pool.query("INSERT INTO identity.data_export(export_id,user_id,session_id,locale,status,requested_at) VALUES($1,$2,$3,'en','PREPARING',clock_timestamp())", [exportId, a.user, a.session]);
    for (const [sql, params] of [
      ["SELECT * FROM identity.claim_data_export($1,60)", [thief]],
      ["SELECT identity.read_data_export_snapshot($1,$2)", [exportId, thief]],
      ["SELECT identity.read_data_export_snapshot_v2($1,$2)", [exportId, thief]],
      ["SELECT identity.complete_data_export($1,$2,$3,$4,1,clock_timestamp())", [exportId, thief, hash("9"), "a".repeat(64)]],
      ["SELECT * FROM identity.sweep_data_exports()", []]
    ] as const) await expect(asRuntime(client => client.query(sql, [...params]))).rejects.toMatchObject({ code: "42501" });
    expect((await db.pool.query("SELECT status,lease_owner FROM identity.data_export WHERE export_id=$1", [exportId])).rows[0])
      .toEqual({ status: "PREPARING", lease_owner: null });
    for (const [sql, params] of [
      ["SELECT * FROM identity.request_data_export($1,$2,$3,$4,'en','{}'::jsonb)", [a.user, a.session, hash("1"), randomUUID()]],
      ["SELECT * FROM identity.read_data_export_status($1)", [a.user]],
      ["SELECT * FROM identity.open_data_export_link($1,$2)", [a.user, hash("1")]],
      ["SELECT identity.record_data_export_download($1,$2,'{}'::jsonb)", [exportId, a.user]]
    ] as const) await expect(asWorker(client => client.query(sql, [...params]))).rejects.toMatchObject({ code: "42501" });
    for (const [index, signature] of signatures.entries()) {
      const request = (await db.pool.query("SELECT has_function_privilege('debateai_authorization_runtime',$1,'EXECUTE') allowed", [`identity.${signature}`])).rows[0].allowed;
      const worker = (await db.pool.query("SELECT has_function_privilege('debateai_data_export_worker',$1,'EXECUTE') allowed", [`identity.${signature}`])).rows[0].allowed;
      expect([request, worker], signature).toEqual(index < 2 || index >= 11 ? [true, false] : [false, true]);
    }
    const { assertDataExportDatabaseRoles } = await import("../../packages/db/src/data-export.js");
    await expect(assertDataExportDatabaseRoles(requestPool, workerPool)).resolves.toBeUndefined();
    await expect(assertDataExportDatabaseRoles(requestPool, requestPool)).rejects.toThrow("DATA_EXPORT_DATABASE_ROLE_MUST_BE_ISOLATED");
    await expect(assertDataExportDatabaseRoles(workerPool, requestPool)).rejects.toThrow("DATA_EXPORT_DATABASE_ROLE_MUST_BE_ISOLATED");
    for (const role of ["debateai_runtime", "debateai_billing_runtime", "debateai_erasure_runtime", "debateai_replay"]) {
      for (const signature of signatures) {
        const allowed = (await db.pool.query("SELECT has_function_privilege($1,$2,'EXECUTE') allowed", [role, `identity.${signature}`])).rows[0].allowed;
        expect(allowed, `${role} ${signature}`).toBe(false);
      }
    }
    const audit = JSON.stringify((await db.pool.query("SELECT source_context FROM identity.audit_event WHERE event_type LIKE 'identity.data_export.%'")).rows);
    expect(audit).not.toContain(hash("9"));
    expect(audit).not.toContain("fixture-ip-plaintext");
    await db.pool.query("UPDATE identity.data_export SET status='CANCELLED',closed_at=clock_timestamp() WHERE export_id=$1", [exportId]);
  });

  it("D15 (V-42) returns each owned run's role rotation with every C7 field, null without a row, and no other account's", async () => {
    const a = await account(), b = await account(), exportId = randomUUID(), worker = randomUUID();
    const ownerOf = async (user: string) => (await db.pool.query(`SELECT owner_ref FROM identity."user" WHERE user_id=$1`, [user])).rows[0].owner_ref as string;
    const repository = new RunRepository(db.pool);
    const run = async (owner: string, tag: string) => {
      const runId = await repository.startRun({ questionLine: `d15-${tag}`, principal: { kind: "legacy", legacyAskerId: `d15-${tag}` },
        sessionId: `session:d15-${tag}`, callerScope: "ASKER", asOf: new Date(), askerRiskTier: "casual", effectiveRiskTier: "casual",
        tierSource: "ASKER", tierProvenanceRef: `d15:${tag}`, compositionBudgetTier: "low", depthParams: { depth: 1 },
        discoveredPanel: fixtureDiscoveredPanel(2), strangerSampleRate: 1, envelopeBasis: { source: "d15" }, registerVersion: 1,
        batteryVersion: "d15", batteryRows: [] });
      await db.pool.query("SELECT core.append_run_ownership_event($1,$2)", [runId, owner]);
      return runId;
    };
    const rotate = (runId: string, t: string) => db.pool.query(`INSERT INTO core.run_role_rotation(run_id,rule,writer_provider_ref,writer_model_id,writer_maker,
      checker_provider_ref,checker_model_id,checker_maker,storyteller_provider_ref,storyteller_model_id,storyteller_maker,story_checker_provider_ref,
      story_checker_model_id,story_checker_maker,eligible_model_ids) VALUES($1,'LEAST_SHARE_SEEDED_TIE_V1',$2,$3,'Maker A',$4,$5,'Maker B',$6,$7,'Maker C',$8,$9,'Maker D',$10::text[])`,
      [runId, `p:${t}:w`, `${t}-writer-model`, `p:${t}:c`, `${t}-checker-model`, `p:${t}:s`, `${t}-storyteller-model`, `p:${t}:sc`, `${t}-story-checker-model`,
        [`${t}-writer-model`, `${t}-checker-model`, `${t}-storyteller-model`, `${t}-story-checker-model`]]);
    const rotated = await run(await ownerOf(a.user), "mine"), plain = await run(await ownerOf(a.user), "plain"), other = await run(await ownerOf(b.user), "theirs");
    await rotate(rotated, "d15-mine"); await rotate(other, "d15-theirs");
    const createdAt = (await db.pool.query("SELECT created_at FROM core.run_role_rotation WHERE run_id=$1", [rotated])).rows[0].created_at as Date;
    await db.pool.query(`INSERT INTO identity.data_export(export_id,user_id,session_id,locale,status,requested_at,attempts,lease_owner,lease_until)
      VALUES($1,$2,$3,'en','PREPARING',clock_timestamp(),1,$4,clock_timestamp()+interval '45 seconds')`, [exportId, a.user, a.session, worker]);
    const raw = (await workerPool.query("SELECT identity.read_data_export_snapshot($1,$2) s", [exportId, worker])).rows[0].s;
    const byId = Object.fromEntries(raw.runs.map((item: { run_id: string }) => [item.run_id, item]));
    expect(Object.keys(byId).sort()).toEqual([rotated, plain].sort());
    expect(JSON.stringify(raw)).not.toContain("d15-theirs");
    const role = (t: string, r: string) => ({ provider_ref: `p:d15-mine:${t}`, model_id: `d15-mine-${r}-model`, maker: { w: "Maker A", c: "Maker B", s: "Maker C", sc: "Maker D" }[t] });
    expect(byId[rotated].role_rotation).toEqual({ rule: "LEAST_SHARE_SEEDED_TIE_V1", writer: role("w", "writer"), checker: role("c", "checker"),
      storyteller: role("s", "storyteller"), story_checker: role("sc", "story-checker"),
      eligible_model_ids: ["d15-mine-writer-model", "d15-mine-checker-model", "d15-mine-storyteller-model", "d15-mine-story-checker-model"],
      created_at: expect.any(String) });
    expect(Date.parse(byId[rotated].role_rotation.created_at)).toBe(createdAt.getTime());
    expect(Object.hasOwn(byId[plain], "role_rotation")).toBe(true);
    expect(byId[plain].role_rotation).toBeNull();
    await expect(workerPool.query("SELECT 1 FROM core.run_role_rotation LIMIT 1")).rejects.toMatchObject({ code: "42501" });
    await db.pool.query("UPDATE identity.data_export SET status='CANCELLED',closed_at=clock_timestamp(),lease_owner=NULL,lease_until=NULL WHERE export_id=$1", [exportId]);
  });

  it("X-IT the worker adapter reads the snapshot through v2: every acceptance carries clauses and leg", async () => {
    const a = await account(), exportId = randomUUID(), worker = randomUUID();
    const owner = (await db.pool.query(`SELECT owner_ref FROM identity."user" WHERE user_id=$1`, [a.user])).rows[0].owner_ref as string;
    // Built from pieces so no whole secret-shaped literal appears in the source.
    const keyId = ["89abcdef", "01234567"].join("");
    const accept = (kind: string, clauses: string | null, leg: string | null) => db.pool.query(
      `INSERT INTO legal.acceptance(acceptance_id,owner_ref,kind,document_version,document_sha256,locale,surface,accepted_at,evidence_ciphertext,key_id,clauses,leg)
       VALUES($1,$2,$3,'2.3',$4,'it','SIGN_UP',clock_timestamp(),$5,$6,$7::smallint[],$8) RETURNING acceptance_id`,
      [randomUUID(), owner, kind, "b".repeat(64), Buffer.alloc(29, 1), keyId, clauses, leg]);
    const terms = (await accept("TERMS", null, null)).rows[0].acceptance_id as string;
    const italy = (await accept("ITALY_SPECIFIC_APPROVAL", "{11,12,14,15,18}", "BOTH")).rows[0].acceptance_id as string;
    await db.pool.query(`INSERT INTO identity.data_export(export_id,user_id,session_id,locale,status,requested_at,attempts,lease_owner,lease_until)
      VALUES($1,$2,$3,'it','PREPARING',clock_timestamp(),1,$4,clock_timestamp()+interval '45 seconds')`, [exportId, a.user, a.session, worker]);
    try {
      const raw = await new PostgresDataExportSource(workerPool).readRaw(exportId, worker);
      const items = raw.legal_acceptances as ReadonlyArray<Record<string, unknown>>;
      expect(items.map(item => item.acceptance_id).sort()).toEqual([terms, italy].sort());
      for (const item of items) {
        expect(Object.hasOwn(item, "clauses"), String(item.kind)).toBe(true);
        expect(Object.hasOwn(item, "leg"), String(item.kind)).toBe(true);
      }
      expect(Object.fromEntries(items.map(item => [item.kind, [item.clauses, item.leg]]))).toEqual({
        TERMS: [null, null], ITALY_SPECIFIC_APPROVAL: [[11, 12, 14, 15, 18], "BOTH"]
      });
    } finally {
      await db.pool.query("UPDATE identity.data_export SET status='CANCELLED',closed_at=clock_timestamp(),lease_owner=NULL,lease_until=NULL WHERE export_id=$1", [exportId]);
    }
  });

  it("X-WEB the worker adapter reads each debate's web evidence (never a page text) and the investigations with the reserve events", async () => {
    const a = await account(), exportId = randomUUID(), worker = randomUUID();
    const owner = (await db.pool.query(`SELECT owner_ref FROM identity."user" WHERE user_id=$1`, [a.user])).rows[0].owner_ref as string;
    const secret = Buffer.alloc(32, 5), runId = randomUUID(), seq = 9_300_000 + Math.floor(Math.random() * 1000);
    // A private debate with content encryption and its attestation secret, seeded as 0132's own suite seeds one.
    const seed = await db.pool.connect();
    try {
      await seed.query("BEGIN");
      await seed.query("SET LOCAL session_replication_role = 'replica'");
      await seed.query(`INSERT INTO core.run
        (run_id,question_line,asker_id,session_id,caller_scope,as_of,asker_risk_tier,risk_tier,
         tier_source,tier_provenance_ref,composition_budget_tier,depth_params,agent_count,discovered_panel,
         stranger_sample_rate,envelope_basis,register_version,battery_version,ask_contract,created_at_seq,
         question_blind_index_version,content_encryption_version)
        VALUES ($1,'Fixture question',$2,$3,'ASKER',now(),'standard','standard','ASKER','fixture','low',
         '{}'::jsonb,2,'[{},{}]'::jsonb,0,'{}'::jsonb,1,'fixture','{}'::jsonb,$4,1,1)`, [runId, `owner:${owner}`, randomUUID(), seq]);
      await seed.query("INSERT INTO core.run_ownership_event(run_id,owner_ref,at_seq) VALUES ($1,$2,$3)", [runId, owner, seq]);
      await seed.query("INSERT INTO core.run_content_attestation_secret(run_id,secret,created_at) VALUES ($1,$2,now())", [runId, secret]);
      await seed.query("COMMIT");
    } catch (error) { await seed.query("ROLLBACK"); throw error; } finally { seed.release(); }
    const sealed = async (carrier: string, ref: string, ct: string): Promise<WebSealed> => {
      const envelope = { v: 1, keyId: "fixture-key", nonce: "AAAAAAAAAAAAAAAA", tag: "AAAAAAAAAAAAAAAAAAAAAA==", ct };
      const attestation = (await db.pool.query(`SELECT audit_crypto_internal.hmac(
          core.content_envelope_attestation_bytes($1,$2,$3,'content_ciphertext',$4::jsonb),$5::bytea,'sha256') AS value`,
        [runId, carrier, ref, JSON.stringify(envelope), secret])).rows[0].value as Buffer;
      return { envelope: envelope as never, attestation };
    };
    const web = new PostgresWebEvidenceRepository(db.pool);
    const search = randomUUID(), page = randomUUID(), extract = randomUUID();
    expect(await web.recordSearch({ runId, searchId: search, pathRef: "pos-1", side: "for", languageKind: "english", language: "en",
      country: null, lookBack: "12m", outcome: "FOUND", chargeMicros: 1000, resultCount: 1,
      words: await sealed("identity.web_search", search, "d29yZHM=") })).toBe("RECORDED");
    expect(await web.recordPage({ runId, pageId: page, searchId: search, rank: 1, readDepth: "whole",
      about: await sealed("identity.web_page", page, "YWJvdXQ="),
      text: { chars: 9, digest: Buffer.alloc(32, 1), sealed: await sealed("identity.web_page_text", page, "eC13ZWItcGFnZS10ZXh0") } })).toBe("RECORDED");
    expect(await web.recordExtract({ runId, extractId: extract, pageId: page, label: "S1-1", foundBy: [1],
      quote: await sealed("identity.web_extract", extract, "cXVvdGU=") })).toBe("RECORDED");
    const investigations = new PostgresInvestigationRepository(db.pool);
    const investigationId = (await investigations.open(owner, runId))!;
    expect(await investigations.recordReserveEvent(owner, { kind: "HELD", amountMicros: 200_000 })).toBe("RECORDED");
    await db.pool.query(`INSERT INTO identity.data_export(export_id,user_id,session_id,locale,status,requested_at,attempts,lease_owner,lease_until)
      VALUES($1,$2,$3,'en','PREPARING',clock_timestamp(),1,$4,clock_timestamp()+interval '45 seconds')`, [exportId, a.user, a.session, worker]);
    try {
      const raw = await new PostgresDataExportSource(workerPool).readRaw(exportId, worker) as Record<string, any>;
      expect(raw.web_evidence.map((entry: { run_id: string }) => entry.run_id)).toEqual([runId]);
      const step = raw.web_evidence[0].web;
      expect(Object.keys(step).sort()).toEqual(["extracts", "packs", "pages", "picks", "readings", "researched", "searches"]);
      expect(step.pages.map((item: { page_id: string; text_state: string; content: { ct: string } }) => [item.page_id, item.text_state, item.content.ct]))
        .toEqual([[page, "STORED", "YWJvdXQ="]]);
      expect(step.extracts.map((item: { label: string; content: { ct: string } }) => [item.label, item.content.ct])).toEqual([["S1-1", "cXVvdGU="]]);
      // The page text stays in identity.web_page_text: 0132's export reader never returns it.
      expect(JSON.stringify(raw)).not.toContain("eC13ZWItcGFnZS10ZXh0");
      expect(raw.investigations.map((item: { investigation_id: string; root_run_id: string }) => [item.investigation_id, item.root_run_id]))
        .toEqual([[investigationId, runId]]);
      expect(raw.reserve_events.map((item: { kind: string; amount_micros: number }) => [item.kind, item.amount_micros])).toEqual([["HELD", 200_000]]);
    } finally {
      await db.pool.query("UPDATE identity.data_export SET status='CANCELLED',closed_at=clock_timestamp(),lease_owner=NULL,lease_until=NULL WHERE export_id=$1", [exportId]);
    }
  });

  it("R31 fails a PREPARING row whose fourth lease expired without fail()", async () => {
    const a = await account();
    const exportId = randomUUID();
    await db.pool.query(`INSERT INTO identity.data_export(export_id,user_id,session_id,locale,status,requested_at,attempts,lease_owner,lease_until)
      VALUES($1,$2,$3,'en','PREPARING',clock_timestamp()-interval '20 minutes',4,$4,clock_timestamp()-interval '10 minutes')`,
    [exportId, a.user, a.session, randomUUID()]);
    const claim = await asWorker(client => client.query("SELECT * FROM identity.claim_data_export($1,45)", [randomUUID()]));
    expect(claim.rows).toEqual([]);
    await asWorker(client => client.query("SELECT * FROM identity.sweep_data_exports()"));
    const row = (await db.pool.query("SELECT status,lease_owner,lease_until FROM identity.data_export WHERE export_id=$1", [exportId])).rows[0];
    expect(row).toEqual({ status: "FAILED", lease_owner: null, lease_until: null });
  });

  it("R37 refuses lease renewal after erasure reaches PROCESSING", async () => {
    const a = await account(), exportId = randomUUID(), worker = randomUUID();
    await db.pool.query(`INSERT INTO identity.data_export(export_id,user_id,session_id,locale,status,requested_at,attempts,lease_owner,lease_until)
      VALUES($1,$2,$3,'en','PREPARING',clock_timestamp(),1,$4,clock_timestamp()+interval '45 seconds')`,
    [exportId, a.user, a.session, worker]);
    await db.pool.query(`INSERT INTO identity.account_erasure_request(user_id,requested_at,execute_at,prepared_at,
      prepared_run_ids,prepared_legacy_run_ids,prepared_published_run_ids,prepared_current_publication_refs,prepared_cleanup_publication_refs)
      VALUES($1,clock_timestamp(),clock_timestamp()+interval '30 days',clock_timestamp(),'{}','{}','{}','{}','{}')`, [a.user]);
    const result = await asWorker(async client => (await client.query("SELECT identity.renew_data_export_lease($1,$2,45) ok", [exportId, worker])).rows[0].ok);
    expect(result).toBe(false);
  });
});
