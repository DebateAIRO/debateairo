import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import type { PoolClient } from "pg";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { PostgresDataExportRepository } from "../../packages/db/src/data-export.js";

const hash = (c: string) => `sha256:${c.repeat(64)}`;
const source = { ipArgon2id: `argon2id-audit:v1:${"a".repeat(64)}`, userAgentArgon2id: `argon2id-audit:v1:${"b".repeat(64)}` };
const signatures = [
  "request_data_export(uuid,uuid,text,uuid,text,jsonb)", "read_data_export_status(uuid)",
  "claim_data_export(uuid,integer)", "renew_data_export_lease(uuid,uuid,integer)",
  "read_data_export_snapshot(uuid,uuid)", "complete_data_export(uuid,uuid,text,text,bigint,timestamp with time zone)",
  "fail_data_export(uuid,uuid,text)", "sweep_data_exports()", "mark_data_export_key_destroyed(uuid)",
  "live_data_export_ids(uuid[])", "open_data_export_link(uuid,text)", "record_data_export_download(uuid,uuid,jsonb)"
];

describe("data export database authority", () => {
  let db: TestDatabase;
  beforeAll(async () => {
    db = await startTestDatabase();
    await migrate(db.pool);
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE debateai_authorization_runtime");
      expect((await client.query("SELECT current_user name")).rows[0].name).toBe("debateai_authorization_runtime");
    } finally { await client.query("ROLLBACK"); client.release(); }
  }, 180_000);
  afterAll(async () => { await db?.stop(); });

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
    expect((await db.pool.query("SELECT identity.valid_consumer_authorization_internal($1::jsonb) valid", [JSON.stringify({ action: "EXPORT_DATA" })])).rows[0].valid).toBe(true);
    expect((await db.pool.query("SELECT identity.valid_consumer_authorization_internal($1::jsonb) valid", [JSON.stringify({ action: "EXPORT_DATA", target_run_id: randomUUID() })])).rows[0].valid).toBe(false);
    await db.pool.query("SELECT identity.insert_consumer_grant_internal($1,$2,$3,$4::jsonb,clock_timestamp()+interval '2 minutes')", [a.user, a.session, hash("d"), JSON.stringify({ action: "EXPORT_DATA" })]);
    expect((await db.pool.query("SELECT target_account_id FROM identity.step_up_grant WHERE token_hash=$1", [hash("d")])).rows[0].target_account_id).toBe(a.user);
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
    const repo = new PostgresDataExportRepository(db.pool, { hashSourceIp: async () => "a".repeat(64), hashUserAgent: async () => "b".repeat(64) } as never);
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
      const token = await grant(a.user, a.session, { hash: `sha256:${String(i + 5).repeat(64)}` });
      expect((await request(a.user, a.session, token)).result_status).toBe("ACCEPTED");
      const sentAt = new Date();
      await db.pool.query("UPDATE identity.data_export SET status='SENT',link_token_hash=$2,archive_sha256=$3,sent_at=$4,expires_at=$4::timestamptz+interval '86400 seconds' WHERE user_id=$1 AND status='PREPARING'", [a.user, `sha256:${String(i + 5).repeat(64)}`, "a".repeat(64), sentAt]);
    }
    const result = await request(a.user, a.session, await grant(a.user, a.session, { hash: hash("8") }));
    expect(result.result_status).toBe("RATE_LIMITED");
    expect(result.result_retry_after_seconds).toBeGreaterThan(86_398);
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
    const [left, right] = await Promise.all([randomUUID(), randomUUID()].map(worker => asRuntime(client => client.query("SELECT * FROM identity.claim_data_export($1,1)", [worker]))));
    expect([left!.rows[0]?.export_id, right!.rows[0]?.export_id].filter(Boolean)).toHaveLength(1);
    await db.pool.query("UPDATE identity.data_export SET lease_until=clock_timestamp()-interval '1 second' WHERE user_id=$1", [a.user]);
    const next = await asRuntime(client => client.query("SELECT * FROM identity.claim_data_export($1,1)", [randomUUID()]));
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
  });

  it("D14 denies table DML and other runtime roles execute on all twelve functions", async () => {
    for (const verb of ["SELECT * FROM", "DELETE FROM", "UPDATE", "INSERT INTO"]) {
      const sql = verb === "UPDATE" ? "UPDATE identity.data_export SET status='FAILED'" : verb === "INSERT INTO" ? "INSERT INTO identity.data_export DEFAULT VALUES" : `${verb} identity.data_export`;
      await expect(asRuntime(client => client.query(sql))).rejects.toMatchObject({ code: "42501" });
    }
    for (const role of ["debateai_runtime", "debateai_billing_runtime", "debateai_erasure_runtime", "debateai_replay"]) {
      for (const signature of signatures) {
        const allowed = (await db.pool.query("SELECT has_function_privilege($1,$2,'EXECUTE') allowed", [role, `identity.${signature}`])).rows[0].allowed;
        expect(allowed, `${role} ${signature}`).toBe(false);
      }
    }
    const audit = JSON.stringify((await db.pool.query("SELECT source_context FROM identity.audit_event WHERE event_type LIKE 'identity.data_export.%'")).rows);
    expect(audit).not.toContain(hash("9"));
    expect(audit).not.toContain("fixture-ip-plaintext");
  });
});
