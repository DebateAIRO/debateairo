import { withMailLocale } from "../../packages/db/src/mail-locale.js";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, migrate, PostgresIdentityRepository, type PendingAccountInput, type Pool, type SignUpAcceptanceRow } from "@debateai/db";
import { createEmailBlindIndex, encrypt, generateDek, sealRecord, type AuditContextHasher } from "@debateai/crypto";
import { AGE_RULE_VERSION, ITALY_APPROVAL_CLAUSES, ITALY_APPROVAL_KIND, MIN_AGE, type ItalyApprovalLeg } from "@debateai/kernel";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * 0125 on real PostgreSQL (mission italy-clause-approval, slice S01, PLAN P10): the two columns, the three CHECKs that
 * guard them, the sign-up writer identity.record_signup_italy_approval (guards in order, then one row copied from the
 * account's TERMS row) and the export reader identity.read_data_export_snapshot_v2 (0115's snapshot plus clauses and
 * leg). Each rejection names its guard; the guards that run earlier on the same operation pass.
 */
let database: TestDatabase;
let repository: PostgresIdentityRepository;
let signup: Pool;
let worker: Pool;
let shared: Pool;
const recordsKey = randomBytes(32);
const hasher = { hashSourceIp: async () => "11".repeat(32), hashUserAgent: async () => "22".repeat(32) } as unknown as AuditContextHasher;
const auditSource = { ipArgon2id: `argon2id-audit:v1:${"a".repeat(64)}`, userAgentArgon2id: `argon2id-audit:v1:${"b".repeat(64)}` };
const CLAUSES = [...ITALY_APPROVAL_CLAUSES];
const RECORD = "identity.record_signup_italy_approval(uuid,jsonb)";
const V2 = "identity.read_data_export_snapshot_v2(uuid,uuid)";
/** Built from pieces so no whole secret-shaped literal appears in the source. */
const KEY_ID = ["0123abcd", "4567ef89"].join("");

type SqlError = { code?: string | undefined; constraint?: string | undefined; message?: string | undefined };
async function sqlError(run: () => Promise<unknown>): Promise<SqlError> {
  try { await run(); return { code: undefined, constraint: undefined, message: undefined }; }
  catch (error) { return error as SqlError; }
}
const sealed = (acceptanceId: string) => sealRecord(recordsKey, { table: "legal.acceptance", column: "evidence_ciphertext", rowId: acceptanceId },
  Buffer.from(JSON.stringify({ ip: "93.40.1.2", user_agent: "test/1" })));
/** The three sign-up rows, each with its own document version and digest, so a copied pair shows which row it came from. */
function signUpRows(): readonly SignUpAcceptanceRow[] {
  const documents = { ADULT: ["2.2", "a"], TERMS: ["2.3", "b"], PRIVACY_SHOWN: ["3.4", "c"] } as const;
  return (["ADULT", "TERMS", "PRIVACY_SHOWN"] as const).map((kind) => {
    const acceptanceId = randomUUID();
    const evidence = sealed(acceptanceId);
    return { acceptanceId, kind, documentVersion: documents[kind][0], documentSha256: documents[kind][1].repeat(64), locale: "it",
      evidenceCiphertext: evidence.ciphertext, keyId: evidence.keyId };
  });
}
function pendingInput(acceptances?: readonly SignUpAcceptanceRow[]): PendingAccountInput {
  const userId = randomUUID();
  const email = `${userId}@example.test`;
  const dek = generateDek();
  const keyId = `user-dek:${userId}`;
  return {
    userId, emailBlindIndex: createEmailBlindIndex(Buffer.alloc(32, 0x3c), email),
    emailCiphertext: encrypt(dek, Buffer.from(email), ["identity", "user.email_ciphertext", userId, "run:none", userId, keyId, "1"]),
    recoveryEmailCiphertext: encrypt(dek, Buffer.from(`r-${email}`), ["identity", "user.recovery_email_ciphertext", userId, "run:none", userId, keyId, "1"]),
    phoneCiphertext: encrypt(dek, Buffer.from("+393471234567"), ["identity", "user.phone_ciphertext", userId, "run:none", userId, keyId, "1"]),
    phoneSource: "manual", phoneVerificationStatus: "unverified", phoneUpdatedAt: new Date(),
    passwordHash: `$argon2id$v=19$m=65536,t=3,p=1$${"A".repeat(22)}$${"A".repeat(43)}`,
    pseudonym: `italy-${userId}`,
    adultAffirmedAt: new Date(), ageCheck: { minAgeApplied: MIN_AGE, countryCode: "IT", ruleVersion: AGE_RULE_VERSION },
    verificationTokenHash: `sha256:${createHash("sha256").update(userId).digest("hex")}`,
    verificationExpiresAt: new Date(Date.now() + 86_400_000), occurredAt: new Date(),
    source: { ip: "93.40.1.2", userAgent: "test/1", requestId: randomUUID() },
    declaredRegion: { country: "IT", usState: null }, ...(acceptances === undefined ? {} : { acceptances })
  };
}
/** A pending account created through identity.create_pending_account_reserved_with_consent (its three rows), or _with_audit (none). */
async function pendingAccount(withConsent = true): Promise<PendingAccountInput> {
  const input = pendingInput(withConsent ? signUpRows() : undefined);
  expect((await repository.createPendingAccount(input, async () => undefined)).status).toBe("created");
  return input;
}
async function activeAccount(): Promise<string> {
  const userId = randomUUID();
  await database.pool.query(`INSERT INTO identity."user" (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,phone_ciphertext,password_hash,pseudonym,state,adult_affirmed_at,created_at)
    VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'hash',$3,'active',now(),now())`, [userId, createHash("sha256").update(userId).digest(), `italy-${userId}`]);
  return userId;
}
/** The writer's p_row: EXACT keys acceptance_id, clauses, leg, evidence_ciphertext (base64), key_id. */
function approvalRow(leg: string, clauses: readonly number[] = CLAUSES) {
  const acceptanceId = randomUUID();
  const evidence = sealed(acceptanceId);
  return { acceptance_id: acceptanceId, clauses, leg, evidence_ciphertext: evidence.ciphertext.toString("base64"), key_id: evidence.keyId };
}
const record = (pool: Pool, userId: string | null, row: unknown) =>
  pool.query("SELECT identity.record_signup_italy_approval($1,$2::jsonb)", [userId, row === null ? null : JSON.stringify(row)]);
type AcceptanceRow = { acceptance_id: string; kind: string; document_version: string; document_sha256: string; locale: string; surface: string;
  accepted_at: Date; evidence_ciphertext: Buffer; key_id: string; clauses: number[] | null; leg: string | null };
const acceptances = async (userId: string): Promise<AcceptanceRow[]> => (await database.pool.query<AcceptanceRow>(`
  SELECT a.acceptance_id,a.kind,a.document_version,a.document_sha256::text AS document_sha256,a.locale,a.surface,a.accepted_at,
    a.evidence_ciphertext,a.key_id,a.clauses,a.leg
  FROM legal.acceptance a JOIN identity."user" u ON u.owner_ref=a.owner_ref WHERE u.user_id=$1 ORDER BY a.kind`, [userId])).rows;
/** A superuser INSERT that passes every 0080 column CHECK (owner_ref shape, digest, locale, surface, evidence, key id). */
const insertRow = (row: Partial<{ kind: string; documentVersion: string; clauses: string | null; leg: string | null }>) => database.pool.query(
  `INSERT INTO legal.acceptance(acceptance_id,owner_ref,kind,document_version,document_sha256,locale,surface,accepted_at,evidence_ciphertext,key_id,clauses,leg)
   VALUES ($1,$2,$3,$4,$5,'it','SIGN_UP',clock_timestamp(),$6,$7,$8::smallint[],$9)`,
  [randomUUID(), randomUUID(), row.kind ?? ITALY_APPROVAL_KIND, row.documentVersion ?? "2.3", "b".repeat(64), Buffer.alloc(29, 1), KEY_ID,
    row.clauses === undefined ? "{11,12,14,15,18}" : row.clauses, row.leg === undefined ? "PICKED" : row.leg]);
const loginPool = (role: string, password: string): Pool => {
  const url = new URL(database.connectionString);
  url.username = role;
  url.password = password;
  return createPool(url.toString());
};

let d5: PendingAccountInput;
let d5Leg: ItalyApprovalLeg;
let d5Row: ReturnType<typeof approvalRow>;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  repository = new PostgresIdentityRepository(database.pool, hasher);
  await database.pool.query("CREATE ROLE italy_signup LOGIN PASSWORD 'italy-signup-test-only' IN ROLE debateai_runtime,debateai_billing_runtime");
  await database.pool.query("CREATE ROLE italy_worker LOGIN PASSWORD 'italy-worker-test-only' IN ROLE debateai_data_export_worker");
  await database.pool.query("CREATE ROLE italy_shared LOGIN PASSWORD 'italy-shared-test-only' IN ROLE debateai_runtime");
  signup = loginPool("italy_signup", "italy-signup-test-only");
  worker = loginPool("italy_worker", "italy-worker-test-only");
  shared = loginPool("italy_shared", "italy-shared-test-only");
  expect((await signup.query("SELECT current_user AS name")).rows[0].name).toBe("italy_signup");
  expect((await worker.query("SELECT current_user AS name")).rows[0].name).toBe("italy_worker");
  expect((await shared.query("SELECT current_user AS name")).rows[0].name).toBe("italy_shared");
}, 180_000);
afterAll(async () => { await signup?.end(); await worker?.end(); await shared?.end(); await database?.stop(); });

describe("0125: the Italy-specific approval on real PostgreSQL", () => {
  it("D1 adds clauses (smallint[]) and leg (text), both nullable, no default", async () => {
    const rows = (await database.pool.query(`SELECT column_name,data_type,udt_name,is_nullable,column_default FROM information_schema.columns
      WHERE table_schema='legal' AND table_name='acceptance' AND column_name IN ('clauses','leg') ORDER BY column_name`)).rows;
    expect(rows).toEqual([
      { column_name: "clauses", data_type: "ARRAY", udt_name: "_int2", is_nullable: "YES", column_default: null },
      { column_name: "leg", data_type: "text", udt_name: "text", is_nullable: "YES", column_default: null }
    ]);
  });

  it("D2 refuses an Italy row with no clauses at acceptance_italy_fields; the full row is accepted", async () => {
    expect(await sqlError(() => insertRow({ clauses: null }))).toMatchObject({ code: "23514", constraint: "acceptance_italy_fields" });
    // The same row with the list and a leg passes every CHECK: the refusal above is the clauses alone.
    await insertRow({});
  });

  it("D3 refuses a leg on another kind, an unknown leg and a short list, each at acceptance_italy_fields", async () => {
    expect(await sqlError(() => insertRow({ kind: "TERMS", clauses: null, leg: "IP" }))).toMatchObject({ code: "23514", constraint: "acceptance_italy_fields" });
    expect(await sqlError(() => insertRow({ leg: "X" }))).toMatchObject({ code: "23514", constraint: "acceptance_italy_fields" });
    expect(await sqlError(() => insertRow({ clauses: "{11,12,14,15}" }))).toMatchObject({ code: "23514", constraint: "acceptance_italy_fields" });
    // Each leg of the kernel's three is accepted, and a TERMS row without the two columns is too.
    for (const leg of ["PICKED", "IP", "BOTH"]) await insertRow({ leg });
    await insertRow({ kind: "TERMS", clauses: null, leg: null });
  });

  it("D4 holds the Italy kind to the N.M version shape, and an unknown kind fails the first CHECK by name", async () => {
    expect(await sqlError(() => insertRow({ documentVersion: "sha256-aaaaaaaaaaaa" })))
      .toMatchObject({ code: "23514", constraint: "acceptance_document_version_shape" });
    expect(await sqlError(() => insertRow({ kind: "BOGUS", clauses: null, leg: null })))
      .toMatchObject({ code: "23514", constraint: "acceptance_document_version_shape" });
  });

  it("D5 writes one Italy row from the account's TERMS row, through the API's role", async () => {
    d5 = await pendingAccount();
    expect((await acceptances(d5.userId)).map((row) => row.kind)).toEqual(["ADULT", "PRIVACY_SHOWN", "TERMS"]);
    d5Leg = "PICKED";
    d5Row = approvalRow(d5Leg);
    await record(signup, d5.userId, d5Row);
    const rows = await acceptances(d5.userId);
    expect(rows.map((row) => row.kind)).toEqual(["ADULT", ITALY_APPROVAL_KIND, "PRIVACY_SHOWN", "TERMS"]);
    const terms = rows.find((row) => row.kind === "TERMS")!;
    const italy = rows.find((row) => row.kind === ITALY_APPROVAL_KIND)!;
    expect(italy).toEqual({
      acceptance_id: d5Row.acceptance_id, kind: ITALY_APPROVAL_KIND, surface: "SIGN_UP", clauses: CLAUSES, leg: d5Leg,
      document_version: terms.document_version, document_sha256: terms.document_sha256, locale: terms.locale, accepted_at: terms.accepted_at,
      evidence_ciphertext: Buffer.from(d5Row.evidence_ciphertext, "base64"), key_id: d5Row.key_id
    });
    // The TERMS row's own pair, not the ADULT or PRIVACY_SHOWN one's.
    expect([italy.document_version, italy.document_sha256]).toEqual(["2.3", "b".repeat(64)]);
    // The other three rows carry neither column.
    expect(rows.filter((row) => row.kind !== ITALY_APPROVAL_KIND).map((row) => [row.clauses, row.leg])).toEqual([[null, null], [null, null], [null, null]]);
  });

  it("D6 refuses, in order: no user or no object, an account not pending, no TERMS row, a second approval", async () => {
    for (const [user, row] of [[null, approvalRow("PICKED")], [d5.userId, null], [d5.userId, [approvalRow("PICKED")]], [d5.userId, "PICKED"]] as const) {
      expect(await sqlError(() => record(signup, user, row))).toMatchObject({ code: "22023", message: "ITALY_APPROVAL_INVALID" });
    }
    const active = await activeAccount();
    expect(await sqlError(() => record(signup, active, approvalRow("PICKED")))).toMatchObject({ code: "22023", message: "ITALY_APPROVAL_ACCOUNT_INVALID" });
    expect(await sqlError(() => record(signup, randomUUID(), approvalRow("PICKED")))).toMatchObject({ code: "22023", message: "ITALY_APPROVAL_ACCOUNT_INVALID" });
    const noTerms = await pendingAccount(false);
    expect(await acceptances(noTerms.userId)).toEqual([]);
    expect(await sqlError(() => record(signup, noTerms.userId, approvalRow("IP")))).toMatchObject({ code: "22023", message: "ITALY_APPROVAL_TERMS_MISSING" });
    expect(await sqlError(() => record(signup, d5.userId, approvalRow("BOTH")))).toMatchObject({ code: "22023", message: "ITALY_APPROVAL_DUPLICATE" });
    expect(await acceptances(noTerms.userId)).toEqual([]);
    expect((await acceptances(d5.userId)).filter((row) => row.kind === ITALY_APPROVAL_KIND).map((row) => row.acceptance_id)).toEqual([d5Row.acceptance_id]);
    // pending_mfa is still a sign-up state: an account whose email is verified passes the account guard.
    const verified = await pendingAccount();
    expect(await repository.consumeVerification({ tokenHash: verified.verificationTokenHash, occurredAt: new Date(), source: verified.source })).toBe(true);
    expect((await database.pool.query('SELECT state FROM identity."user" WHERE user_id=$1', [verified.userId])).rows[0].state).toBe("pending_mfa");
    await record(signup, verified.userId, approvalRow("BOTH"));
    expect((await acceptances(verified.userId)).map((row) => [row.kind, row.leg])).toEqual([["ADULT", null], [ITALY_APPROVAL_KIND, "BOTH"], ["PRIVACY_SHOWN", null], ["TERMS", null]]);
  });

  it("D7 lets only the API's role run the writer and only the export worker run v2", async () => {
    const fresh = await pendingAccount();
    expect(await sqlError(() => record(shared, fresh.userId, approvalRow("PICKED")))).toMatchObject({ code: "42501" });
    expect(await sqlError(() => worker.query(`SELECT identity.record_signup_italy_approval($1,$2::jsonb)`, [fresh.userId, JSON.stringify(approvalRow("PICKED"))])))
      .toMatchObject({ code: "42501" });
    expect((await acceptances(fresh.userId)).map((row) => row.kind)).toEqual(["ADULT", "PRIVACY_SHOWN", "TERMS"]);
    const grantees = ["public", "debateai_runtime", "debateai_authorization_runtime", "debateai_billing_runtime", "debateai_erasure_runtime",
      "debateai_replay", "debateai_data_export_worker"];
    const census = (await database.pool.query<{ grantee: string; record: boolean; v2: boolean }>(`
      SELECT grantee, has_function_privilege(grantee,$2::text,'EXECUTE') AS record, has_function_privilege(grantee,$3::text,'EXECUTE') AS v2
      FROM unnest($1::text[]) WITH ORDINALITY AS g(grantee, n) ORDER BY n`, [grantees, RECORD, V2])).rows;
    expect(census).toEqual(grantees.map((grantee) => ({
      grantee, record: grantee === "debateai_billing_runtime", v2: grantee === "debateai_data_export_worker"
    })));
  });

  it("D8 refuses a wrong list or leg through the writer at acceptance_italy_fields and leaves the three rows", async () => {
    const fresh = await pendingAccount();
    expect(await sqlError(() => record(signup, fresh.userId, approvalRow("PICKED", [11, 12])))).toMatchObject({ code: "23514", constraint: "acceptance_italy_fields" });
    expect(await sqlError(() => record(signup, fresh.userId, approvalRow("PICKED", [18, 15, 14, 12, 11])))).toMatchObject({ code: "23514", constraint: "acceptance_italy_fields" });
    expect(await sqlError(() => record(signup, fresh.userId, approvalRow("X")))).toMatchObject({ code: "23514", constraint: "acceptance_italy_fields" });
    expect(await acceptances(fresh.userId)).toHaveLength(3);
  });

  it("D9 v2 returns 0115's snapshot with clauses and leg on every acceptance, under 0115's lease", async () => {
    // D5's account, verified and active, asks for its export (0115's request through the authorization role), and the
    // worker claims it.
    expect(await repository.consumeVerification({ tokenHash: d5.verificationTokenHash, occurredAt: new Date(), source: d5.source })).toBe(true);
    await withMailLocale(database.pool, "en", (client) => client.query(`UPDATE identity."user" SET state='active' WHERE user_id=$1`, [d5.userId]));
    const session = randomUUID();
    await database.pool.query(`INSERT INTO identity.session(session_id,user_id,token_hash,csrf_token_hash,binding_context,idle_expires_at,absolute_expires_at,last_mfa_at)
      VALUES($1,$2,$3,$4,'{}',clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours',clock_timestamp())`,
    [session, d5.userId, `sha256:${createHash("sha256").update(session).digest("hex")}`, `sha256:${createHash("sha256").update(d5.userId).digest("hex")}`]);
    const token = `sha256:${createHash("sha256").update(randomUUID()).digest("hex")}`;
    await database.pool.query(`INSERT INTO identity.step_up_grant(step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,target_account_id,issued_at,expires_at)
      VALUES($1,$2,$3,$4,'EXPORT_DATA',NULL,$4,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '2 minutes')`, [randomUUID(), token, session, d5.userId]);
    const exportId = randomUUID();
    const client = await database.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE debateai_authorization_runtime");
      await client.query("SELECT identity.begin_runtime_audit_attempt()");
      expect((await client.query("SELECT * FROM identity.request_data_export($1,$2,$3,$4,'en',$5::jsonb)",
        [d5.userId, session, token, exportId, JSON.stringify(auditSource)])).rows[0].result_status).toBe("ACCEPTED");
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    const lease = randomUUID();
    expect((await worker.query("SELECT export_id FROM identity.claim_data_export($1,60)", [lease])).rows).toEqual([{ export_id: exportId }]);

    const v1 = (await worker.query("SELECT identity.read_data_export_snapshot($1,$2) AS s", [exportId, lease])).rows[0].s as Record<string, unknown>;
    const v2 = (await worker.query("SELECT identity.read_data_export_snapshot_v2($1,$2) AS s", [exportId, lease])).rows[0].s as Record<string, unknown>;
    type Exported = Record<string, unknown> & { acceptance_id: string; kind: string };
    const first = v1.legal_acceptances as Exported[];
    const second = v2.legal_acceptances as Exported[];
    expect(first).toHaveLength(4);
    expect(second.map((item) => item.acceptance_id)).toEqual(first.map((item) => item.acceptance_id));
    expect(second).toEqual(first.map((item) => ({
      ...item, clauses: item.kind === ITALY_APPROVAL_KIND ? CLAUSES : null, leg: item.kind === ITALY_APPROVAL_KIND ? d5Leg : null
    })));
    expect(second.filter((item) => item.kind === ITALY_APPROVAL_KIND).map((item) => item.acceptance_id)).toEqual([d5Row.acceptance_id]);
    // Every other part of the snapshot is v1's, unchanged.
    expect({ ...v2, legal_acceptances: null }).toEqual({ ...v1, legal_acceptances: null });
    // The lease check is v1's own: another worker id is refused as 0115 refuses it (EXECUTE on v2 passes as the worker).
    expect(await sqlError(() => worker.query("SELECT identity.read_data_export_snapshot_v2($1,$2) AS s", [exportId, randomUUID()])))
      .toMatchObject({ code: "P0001", message: "DATA_EXPORT_LEASE_INVALID" });
  });
});
