import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, PostgresIdentityRepository, type PendingAccountInput, type SignUpAcceptanceRow } from "@debateai/db";
import { PostgresUnfinishedSignupExpiryRepository } from "../../packages/db/src/unfinished-signup-expiry.js";
import { createEmailBlindIndex, encrypt, generateDek, sealRecord, type AuditContextHasher } from "@debateai/crypto";
import { AGE_RULE_VERSION, MIN_AGE } from "@debateai/kernel";
import { createUnfinishedSignupExpiry } from "../../apps/api/src/unfinished-signup-expiry.js";
import { createSystemTwin } from "../support/rls-logins.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

// Migration 0183 against a real database: a sign-up still pending 24 hours after it began, once no link it was sent is still live, is deleted, with
// everything that hangs on it; its address and name are free again; a finished or younger account, or one whose resent link is still good, is never
// touched; and only a login that holds the cross-account marker may run it.

const TABLE = "identity.unfinished_signup_key_cleanup";
const FUNCTIONS = ["identity.read_unfinished_signups_due(integer)", "identity.expire_unfinished_signup(uuid)",
  "identity.read_unfinished_signup_key_cleanup(integer)", "identity.complete_unfinished_signup_key_cleanup(uuid)"];
const OTHER_ROLES = ["public", "debateai_runtime", "debateai_billing_runtime", "debateai_authorization_runtime", "debateai_erasure_runtime", "debateai_replay",
  "debateai_data_export_worker"];
const HOUR = 3_600_000;
const timeout = 300_000;
const recordsKey = randomBytes(32);
const hasher = { hashSourceIp: async () => "11".repeat(32), hashUserAgent: async () => "22".repeat(32) } as unknown as AuditContextHasher;
const source = () => ({ ip: "81.196.1.2", userAgent: "test/1", requestId: randomUUID() });

let db: TestDatabase;
let identity: PostgresIdentityRepository;
let system: Pool;
let expiry: PostgresUnfinishedSignupExpiryRepository;

function signUpRows(): readonly SignUpAcceptanceRow[] {
  return (["ADULT", "TERMS", "PRIVACY_SHOWN"] as const).map((kind) => {
    const acceptanceId = randomUUID();
    const sealed = sealRecord(recordsKey, { table: "legal.acceptance", column: "evidence_ciphertext", rowId: acceptanceId }, Buffer.from(JSON.stringify({ ip: "81.196.1.2", user_agent: "test/1" })));
    return { acceptanceId, kind, documentVersion: kind === "PRIVACY_SHOWN" ? "3.0" : "2.0", documentSha256: "a".repeat(64), locale: "ro", evidenceCiphertext: sealed.ciphertext, keyId: sealed.keyId };
  });
}

function pendingInput(options: { email?: string; pseudonym?: string; acceptances?: readonly SignUpAcceptanceRow[] } = {}): PendingAccountInput {
  const userId = randomUUID();
  const email = options.email ?? `${userId}@example.test`;
  const dek = generateDek();
  const keyId = `user-dek:${userId}`;
  const now = new Date();
  return {
    userId, emailBlindIndex: createEmailBlindIndex(Buffer.alloc(32, 0x3c), email),
    emailCiphertext: encrypt(dek, Buffer.from(email), ["identity", "user.email_ciphertext", userId, "run:none", userId, keyId, "1"]),
    recoveryEmailCiphertext: encrypt(dek, Buffer.from(`r-${email}`), ["identity", "user.recovery_email_ciphertext", userId, "run:none", userId, keyId, "1"]),
    phoneCiphertext: null, phoneSource: null, phoneVerificationStatus: null, phoneUpdatedAt: null,
    passwordHash: `$argon2id$v=19$m=65536,t=3,p=1$${"A".repeat(22)}$${"A".repeat(43)}`,
    pseudonym: options.pseudonym ?? `expiry-${userId}`,
    adultAffirmedAt: now, ageCheck: { minAgeApplied: MIN_AGE, countryCode: "RO", ruleVersion: AGE_RULE_VERSION },
    verificationTokenHash: `sha256:${createHash("sha256").update(userId).digest("hex")}`,
    verificationExpiresAt: new Date(now.getTime() + 24 * HOUR), occurredAt: now,
    source: source(), declaredRegion: { country: "RO", usState: null },
    ...(options.acceptances === undefined ? {} : { acceptances: options.acceptances })
  };
}

/**
 * Moves an account back in time by `ageMs`, as if that long had passed: its sign-up time, every link it was sent (a link's issue and its end move
 * together, so a 24-hour link sent at sign-up has run out once the account is 24 hours old) and its mails' send reservations.
 */
async function age(userId: string, ageMs: number): Promise<void> {
  await db.pool.query(`UPDATE identity."user" SET created_at = created_at - ($2::bigint * interval '1 millisecond') WHERE user_id = $1`, [userId, ageMs]);
  await db.pool.query(`UPDATE identity.verification_token_credential AS link
    SET issued_at = link.issued_at - ($2::bigint * interval '1 millisecond'), expires_at = link.expires_at - ($2::bigint * interval '1 millisecond')
    FROM identity.channel_binding AS channel WHERE channel.channel_binding_id = link.channel_binding_id AND channel.user_id = $1`, [userId, ageMs]);
  await db.pool.query(`UPDATE identity.verification_delivery_reservation AS reservation
    SET reserved_at = reservation.reserved_at - ($2::bigint * interval '1 millisecond')
    FROM identity.channel_binding AS channel WHERE channel.channel_binding_id = reservation.channel_binding_id AND channel.user_id = $1`, [userId, ageMs]);
}
/** A sign-up as the API writes it, then moved back in time: its created_at, and its link with it, are `ageMs` old. */
async function signUp(ageMs: number, options: Parameters<typeof pendingInput>[0] = {}): Promise<PendingAccountInput> {
  const input = pendingInput(options);
  expect((await identity.createPendingAccount(input, async () => undefined)).status).toBe("created");
  await age(input.userId, ageMs);
  return input;
}
const stateOf = async (userId: string) => (await db.pool.query<{ state: string }>(`SELECT state FROM identity."user" WHERE user_id = $1`, [userId])).rows[0]?.state ?? null;
const count = async (sql: string, values: readonly unknown[]) => (await db.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${sql}`, [...values])).rows[0]!.n;
const sqlError = async (run: () => Promise<unknown>) => { try { await run(); return {}; } catch (error) { return error as { code?: string; message?: string }; } };
/** Every test leaves nothing due and nothing owed behind, so each starts from an empty pass. */
async function drain(): Promise<void> {
  for (const userId of await expiry.due(1000)) await expiry.expire(userId);
  for (const userId of await expiry.keyCleanupOwed(1000)) await expiry.completeKeyCleanup(userId);
}

beforeAll(async () => {
  db = await startTestDatabase();
  await migrate(db.pool);
  identity = new PostgresIdentityRepository(db.pool, hasher);
  // The API's system login, as it runs the pass outside a request: a real login with the API's own capability and the cross-account marker.
  system = new Pool({ connectionString: await createSystemTwin(db, "use_system", ["debateai_billing_runtime"]), max: 4 });
  // The API's request login and its erasure login: real logins too, without the marker.
  for (const [login, role] of [["use_request", "debateai_billing_runtime"], ["use_erasure", "debateai_erasure_runtime"]] as const) {
    await db.pool.query(`CREATE ROLE ${login} LOGIN PASSWORD '${login}-test-only' IN ROLE ${role}`);
  }
  expiry = new PostgresUnfinishedSignupExpiryRepository(system);
}, timeout);
afterAll(async () => {
  await system?.end();
  await db?.stop();
}, timeout);

describe("0183 a sign-up not finished within 24 hours is deleted", () => {
  it("deletes a sign-up whose mail link was never opened, with everything that hangs on it, and frees its address and name", async () => {
    await drain();
    const email = `${randomUUID()}@example.test`;
    const first = await signUp(24 * HOUR + 1000, { email, acceptances: signUpRows() });
    const ownerRef = (await db.pool.query<{ owner_ref: string }>(`SELECT owner_ref FROM identity."user" WHERE user_id = $1`, [first.userId])).rows[0]!.owner_ref;
    const auditToken = (await db.pool.query<{ audit_token: string }>(`SELECT audit_token FROM identity."user" WHERE user_id = $1`, [first.userId])).rows[0]!.audit_token;
    // Its two channels: the sign-up address and the recovery address.
    expect(await count("identity.channel_binding WHERE user_id = $1", [first.userId])).toBe(2);
    expect(await count("identity.age_check WHERE user_id = $1", [first.userId])).toBe(1);
    expect(await count("identity.registration_region WHERE user_id = $1", [first.userId])).toBe(1);
    expect(await count("identity.verification_token_credential WHERE token_hash = $1", [first.verificationTokenHash])).toBe(1);
    // Before: the address is taken, for good.
    expect((await identity.createPendingAccount(pendingInput({ email }), async () => undefined)).status).toBe("email_duplicate");

    expect(await expiry.due(100)).toEqual([first.userId]);
    expect(await expiry.expire(first.userId)).toBe("EXPIRED");

    expect(await stateOf(first.userId)).toBeNull();
    expect(await count("identity.channel_binding WHERE user_id = $1", [first.userId])).toBe(0);
    expect(await count("identity.age_check WHERE user_id = $1", [first.userId])).toBe(0);
    expect(await count("identity.registration_region WHERE user_id = $1", [first.userId])).toBe(0);
    expect(await count("identity.verification_token_credential WHERE token_hash = $1", [first.verificationTokenHash])).toBe(0);
    expect(await expiry.due(100)).toEqual([]);
    // Kept, as for an erased account: the legal acceptances, whose six years start now, and one audit row in the account's own audit name.
    expect(await count("legal.acceptance WHERE owner_ref = $1", [ownerRef])).toBe(3);
    expect(await count("legal.account_closure WHERE owner_ref = $1", [ownerRef])).toBe(1);
    const audit = (await db.pool.query<{ target_type: string; target_id: string; decision: string; success: boolean; justification: string; source_context: unknown }>(
      `SELECT target_type,target_id,decision,success,justification,source_context FROM identity.audit_event WHERE event_type = 'identity.registration.expired' AND actor_key_ref = $1`, [auditToken])).rows;
    expect(audit).toEqual([{ target_type: "identity.registration", target_id: auditToken, decision: "ALLOW", success: true,
      justification: "SIGNUP_NOT_FINISHED_WITHIN_24_HOURS", source_context: { schema: "unfinished-signup-expiry-v1" } }]);
    // The link the mail carried opens nothing now.
    expect(await identity.consumeVerification({ tokenHash: first.verificationTokenHash, occurredAt: new Date(), source: source() })).toBe(false);
    // After: the same address and the same name sign up again.
    const again = pendingInput({ email, pseudonym: first.pseudonym });
    expect((await identity.createPendingAccount(again, async () => undefined)).status).toBe("created");
    expect(await stateOf(again.userId)).toBe("pending_verification");
    expect(await expiry.expire(again.userId)).toBe("NOT_DUE");
  }, timeout);

  it("deletes a sign-up whose link was opened but whose second factor was never set up (pending_mfa)", async () => {
    await drain();
    const input = pendingInput();
    expect((await identity.createPendingAccount(input, async () => undefined)).status).toBe("created");
    expect(await identity.consumeVerification({ tokenHash: input.verificationTokenHash, occurredAt: new Date(), source: source() })).toBe(true);
    expect(await stateOf(input.userId)).toBe("pending_mfa");
    expect(await expiry.due(100)).toEqual([]);
    expect(await expiry.expire(input.userId)).toBe("NOT_DUE");
    // 25 hours on, its consumed link (the authority to set up the second factor, 0100) has run out with it.
    await age(input.userId, 25 * HOUR);
    expect(await expiry.due(100)).toEqual([input.userId]);
    expect(await expiry.expire(input.userId)).toBe("EXPIRED");
    expect(await stateOf(input.userId)).toBeNull();
    expect(await count("identity.channel_binding WHERE user_id = $1", [input.userId])).toBe(0);
  }, timeout);

  it("never touches a sign-up younger than 24 hours, nor an account in any other state, however old", async () => {
    await drain();
    const young = await signUp(23 * HOUR + 59 * 60_000);
    const others: Array<{ userId: string; state: string }> = [];
    for (const state of ["active", "suspended", "age_frozen", "deleted"]) {
      const account = await signUp(0);
      await db.pool.query(`UPDATE identity."user" SET state = $2, created_at = clock_timestamp() - interval '90 days' WHERE user_id = $1`, [account.userId, state]);
      others.push({ userId: account.userId, state });
    }
    expect(await expiry.due(1000)).toEqual([]);
    expect(await expiry.expire(young.userId)).toBe("NOT_DUE");
    expect(await stateOf(young.userId)).toBe("pending_verification");
    for (const other of others) {
      expect(await expiry.expire(other.userId), other.state).toBe("NOT_DUE");
      expect(await stateOf(other.userId), other.state).toBe(other.state);
    }
    expect(await expiry.expire(randomUUID())).toBe("NOT_DUE");
    expect(await count("identity.unfinished_signup_key_cleanup", [])).toBe(0);
    // A sign-up that finished while the pass held its id is seen under the locks: the delete asks the state again.
    const finishing = await signUp(30 * HOUR);
    expect(await expiry.due(100)).toEqual([finishing.userId]);
    await db.pool.query(`UPDATE identity."user" SET state = 'active' WHERE user_id = $1`, [finishing.userId]);
    expect(await expiry.expire(finishing.userId)).toBe("NOT_DUE");
    expect(await stateOf(finishing.userId)).toBe("active");
  }, timeout);

  it("waits for a sign-up step in flight on the same account, and then decides on what that step left", async () => {
    await drain();
    // A step in flight holds the account's security-subject lock (0085), as a verification or an enrollment does, and finishes the sign-up.
    const finishing = await signUp(30 * HOUR);
    const step = await db.pool.connect();
    try {
      await step.query("BEGIN");
      await step.query("SELECT identity.lock_security_subjects(ARRAY[$1]::uuid[])", [finishing.userId]);
      let settled: string | null = null;
      const expiring = expiry.expire(finishing.userId).then((outcome) => { settled = outcome; return outcome; });
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(settled).toBeNull();
      await step.query(`UPDATE identity."user" SET state = 'active' WHERE user_id = $1`, [finishing.userId]);
      await step.query("COMMIT");
      expect(await expiring).toBe("NOT_DUE");
    } catch (error) { await step.query("ROLLBACK").catch(() => undefined); throw error; } finally { step.release(); }
    expect(await stateOf(finishing.userId)).toBe("active");
    // The other way round: the step in flight leaves the sign-up unfinished, and the delete that waited then takes it.
    const abandoned = await signUp(30 * HOUR);
    const other = await db.pool.connect();
    try {
      await other.query("BEGIN");
      await other.query("SELECT identity.lock_security_subjects(ARRAY[$1]::uuid[])", [abandoned.userId]);
      const expiring = expiry.expire(abandoned.userId);
      await new Promise((resolve) => setTimeout(resolve, 200));
      await other.query("ROLLBACK");
      expect(await expiring).toBe("EXPIRED");
    } finally { other.release(); }
    expect(await stateOf(abandoned.userId)).toBeNull();
    await drain();
  }, timeout);

  it("keeps a sign-up whose link was resent within its 24 hours until that link runs out, and then deletes it", async () => {
    await drain();
    const email = `${randomUUID()}@example.test`;
    const resent = await signUp(23 * HOUR, { email });
    const resend = await identity.prepareVerificationResend({
      emailBlindIndex: createEmailBlindIndex(Buffer.alloc(32, 0x3c), email),
      tokenHash: `sha256:${createHash("sha256").update(`resend-${resent.userId}`).digest("hex")}`,
      expiresAt: new Date(Date.now() + 24 * HOUR), occurredAt: new Date(), cooldownMs: 60_000, windowMs: HOUR, maximumSends: 3, tokenTtlMs: 24 * HOUR,
      mechanism: "atomic_rolling_reservation_ledger", source: source()
    });
    expect(resend.status).toBe("send");
    // Two hours on: the sign-up is 25 hours old, its first link has run out, the one resent an hour before the 24th is good for 22 hours more.
    await age(resent.userId, 2 * HOUR);
    expect(await expiry.due(100)).toEqual([]);
    expect(await expiry.expire(resent.userId)).toBe("NOT_DUE");
    expect(await stateOf(resent.userId)).toBe("pending_verification");
    // Once the resent link has run out too, nothing is left to wait for.
    await age(resent.userId, 22 * HOUR + 1000);
    expect(await expiry.due(100)).toEqual([resent.userId]);
    expect(await expiry.expire(resent.userId)).toBe("EXPIRED");
    expect(await stateOf(resent.userId)).toBeNull();
    await drain();
  }, timeout);

  it("deletes an untrusted social sign-up left without a password and a provider link (0178, NV-13) like any other", async () => {
    await drain();
    // 0178's create_social_account_v2 leaves the untrusted arm's account pending_verification with a NULL password and no social_identity row,
    // which 0178's origin check admits only while the account is pending_verification.
    const social = await signUp(25 * HOUR);
    await db.pool.query(`UPDATE identity."user" SET password_hash = NULL WHERE user_id = $1`, [social.userId]);
    expect(await count("identity.social_identity WHERE user_id = $1", [social.userId])).toBe(0);
    expect(await expiry.due(100)).toEqual([social.userId]);
    expect(await expiry.expire(social.userId)).toBe("EXPIRED");
    expect(await stateOf(social.userId)).toBeNull();
    await drain();
  }, timeout);

  it("nothing refuses the delete: every foreign key on the account cascades or empties its column", async () => {
    // A later table that held a sign-up's row by a key that refuses (NO ACTION or RESTRICT) would make every expire of such a sign-up fail.
    const refusing = (await db.pool.query<{ relation: string; name: string }>(`
      SELECT key.conrelid::regclass::text AS relation, key.conname::text AS name FROM pg_catalog.pg_constraint AS key
      WHERE key.contype = 'f' AND key.confrelid = 'identity."user"'::regclass AND key.confdeltype NOT IN ('c', 'n')
      ORDER BY 1, 2`)).rows;
    expect(refusing).toEqual([]);
  }, timeout);

  it("lists the oldest sign-up first, at most as many as asked, and refuses any other count", async () => {
    await drain();
    const newest = await signUp(25 * HOUR);
    const oldest = await signUp(72 * HOUR);
    const middle = await signUp(48 * HOUR);
    expect(await expiry.due(100)).toEqual([oldest.userId, middle.userId, newest.userId]);
    expect(await expiry.due(2)).toEqual([oldest.userId, middle.userId]);
    for (const limit of [0, 1001, -1]) {
      expect(await sqlError(() => expiry.due(limit)), String(limit)).toMatchObject({ code: "22023", message: "UNFINISHED_SIGNUP_EXPIRY_INVALID" });
      expect(await sqlError(() => expiry.keyCleanupOwed(limit)), String(limit)).toMatchObject({ code: "22023", message: "UNFINISHED_SIGNUP_EXPIRY_INVALID" });
    }
    expect(await sqlError(() => system.query("SELECT identity.expire_unfinished_signup(NULL)"))).toMatchObject({ code: "22023" });
    expect(await sqlError(() => system.query("SELECT identity.complete_unfinished_signup_key_cleanup(NULL)"))).toMatchObject({ code: "22023" });
  }, timeout);

  it("the owner's runbook counts exactly the sign-ups the first pass deletes (MAIN-SITE.md's UNFINISHED)", async () => {
    // The owner names this count before the upload's downtime, so it must ask what the pass asks: still pending, begun 24 hours ago or more, and
    // no link still live. It runs as the database's administrator, outside any login of the API.
    const runbook = readFileSync(new URL("../../deploy/preview-auth-dev/v1/MAIN-SITE.md", import.meta.url), "utf8");
    const lines = runbook.split("\n").filter((text) => text.startsWith('N=$(psqlq "SELECT count(*) FROM identity.\\"user\\" '));
    expect(lines).toHaveLength(1);
    const sql = /^N=\$\(psqlq "((?:[^"\\]|\\.)*)"\)/u.exec(lines[0]!)![1]!.replace(/\\"/gu, '"');
    const runbookCount = async () => Number((await db.pool.query<{ count: string }>(sql)).rows[0]!.count);
    await drain();
    expect(await runbookCount()).toBe(0);
    const due = [await signUp(72 * HOUR), await signUp(25 * HOUR)];
    const young = await signUp(23 * HOUR);
    const withLiveLink = await signUp(30 * HOUR);
    await db.pool.query(`UPDATE identity.verification_token_credential AS link SET expires_at = clock_timestamp() + interval '1 hour'
      FROM identity.channel_binding AS channel WHERE channel.channel_binding_id = link.channel_binding_id AND channel.user_id = $1`, [withLiveLink.userId]);
    const finished = await signUp(0);
    await db.pool.query(`UPDATE identity."user" SET state = 'active', created_at = clock_timestamp() - interval '90 days' WHERE user_id = $1`, [finished.userId]);
    expect(await runbookCount()).toBe(2);
    expect([...await expiry.due(1000)].sort()).toEqual(due.map(({ userId }) => userId).sort());
    await drain();
    expect(await runbookCount()).toBe(0);
    for (const kept of [young, withLiveLink]) expect(await stateOf(kept.userId)).toBe("pending_verification");
    expect(await stateOf(finished.userId)).toBe("active");
  }, timeout);

  it("keeps each deleted sign-up's key file owed until the API says it is gone", async () => {
    await drain();
    const first = await signUp(26 * HOUR);
    const second = await signUp(25 * HOUR);
    expect(await expiry.keyCleanupOwed(100)).toEqual([]);
    expect(await expiry.expire(first.userId)).toBe("EXPIRED");
    expect(await expiry.expire(second.userId)).toBe("EXPIRED");
    expect(await expiry.keyCleanupOwed(100)).toEqual([first.userId, second.userId]);
    expect(await expiry.keyCleanupOwed(1)).toEqual([first.userId]);
    expect(await expiry.completeKeyCleanup(first.userId)).toBe(true);
    expect(await expiry.completeKeyCleanup(first.userId)).toBe(false);
    expect(await expiry.keyCleanupOwed(100)).toEqual([second.userId]);
    expect(await expiry.completeKeyCleanup(second.userId)).toBe(true);
    expect(await count("identity.unfinished_signup_key_cleanup", [])).toBe(0);
    // A second delete of the same sign-up finds nothing and owes nothing.
    expect(await expiry.expire(first.userId)).toBe("NOT_DUE");
    expect(await expiry.keyCleanupOwed(100)).toEqual([]);
  }, timeout);

  it("the API's pass deletes every sign-up due, destroys each one's key file and takes its row; a file that fails stays owed for the next pass", async () => {
    await drain();
    const due = [await signUp(30 * HOUR), await signUp(29 * HOUR), await signUp(28 * HOUR)];
    const young = await signUp(HOUR);
    const destroyed: string[] = [];
    const lines: string[] = [];
    let failing: string | null = due[1]!.userId;
    const pass = createUnfinishedSignupExpiry({
      repository: expiry,
      users: { destroy: async (userId) => { if (userId === failing) throw new Error("disk"); destroyed.push(userId); return "DESTROYED"; } },
      log: (line) => lines.push(line)
    });
    await expect(pass.run()).rejects.toThrow("UNFINISHED_SIGNUP_EXPIRY_INCOMPLETE");
    for (const account of due) expect(await stateOf(account.userId)).toBeNull();
    expect(await stateOf(young.userId)).toBe("pending_verification");
    expect(destroyed).toEqual([due[0]!.userId, due[2]!.userId]);
    expect(await expiry.keyCleanupOwed(100)).toEqual([due[1]!.userId]);
    expect(lines.map((line) => JSON.parse(line))).toEqual([{ event: "signup.unfinished_expired", expired: 3, keys: 2, failed: 1 }]);
    // The next pass finishes what the first could not.
    failing = null;
    expect(await pass.run()).toEqual({ expired: 0, keys: 1, failed: 0, backlog: false });
    expect(destroyed).toEqual([due[0]!.userId, due[2]!.userId, due[1]!.userId]);
    expect(await expiry.keyCleanupOwed(100)).toEqual([]);
  }, timeout);

  it("only the cross-account marker may run it, never a request login nor the erasure login; no login holds any right on the table", async () => {
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
      for (const role of [...OTHER_ROLES.filter((name) => name !== "public"), "debateai_rls_all_accounts"]) {
        expect((await db.pool.query<{ allowed: boolean }>("SELECT has_table_privilege($1,$2,$3) AS allowed", [role, TABLE, privilege])).rows[0]?.allowed, `${role} ${privilege}`).toBe(false);
      }
    }
    for (const signature of FUNCTIONS) {
      expect((await db.pool.query<{ allowed: boolean }>("SELECT has_function_privilege('debateai_rls_all_accounts',$1,'EXECUTE') AS allowed", [signature])).rows[0]?.allowed, signature).toBe(true);
      for (const role of OTHER_ROLES) {
        expect((await db.pool.query<{ allowed: boolean }>("SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed", [role, signature])).rows[0]?.allowed, `${role} ${signature}`).toBe(false);
      }
      const shape = (await db.pool.query<{ definer: boolean; config: string[] }>("SELECT p.prosecdef AS definer, p.proconfig AS config FROM pg_proc AS p WHERE p.oid = $1::regprocedure", [signature])).rows[0];
      expect(shape).toEqual({ definer: true, config: ["search_path=pg_catalog"] });
    }
    const account = await signUp(30 * HOUR);
    for (const login of ["use_request", "use_erasure"]) {
      const url = new URL(db.connectionString);
      url.username = login;
      url.password = `${login}-test-only`;
      const denied = new Pool({ connectionString: url.toString(), max: 1 });
      try {
        expect(await sqlError(() => denied.query("SELECT identity.expire_unfinished_signup($1::uuid)", [account.userId])), login).toMatchObject({ code: "42501" });
        expect(await sqlError(() => denied.query("SELECT identity.read_unfinished_signups_due(10)")), login).toMatchObject({ code: "42501" });
        expect(await sqlError(() => denied.query("SELECT identity.read_unfinished_signup_key_cleanup(10)")), login).toMatchObject({ code: "42501" });
        expect(await sqlError(() => denied.query("SELECT identity.complete_unfinished_signup_key_cleanup($1::uuid)", [account.userId])), login).toMatchObject({ code: "42501" });
      } finally { await denied.end(); }
    }
    expect(await stateOf(account.userId)).toBe("pending_verification");
    await drain();
  }, timeout);
});
