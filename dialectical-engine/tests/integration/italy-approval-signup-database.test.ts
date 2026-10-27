import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPool, migrate, PostgresDataExportSource, PostgresIdentityRepository,
  type ItalyApprovalAcceptanceRow, type PendingAccountInput, type Pool, type SignUpAcceptanceRow
} from "@debateai/db";
import { createEmailBlindIndex, encrypt, generateDek, openRecord, sealRecord, type AuditContextHasher } from "@debateai/crypto";
import { AGE_RULE_VERSION, ITALY_APPROVAL_CLAUSES, ITALY_APPROVAL_KIND, MIN_AGE, type ItalyApprovalLeg } from "@debateai/kernel";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * The email sign-up adapter writes the Italy approval (mission italy-clause-approval, slice S01, PLAN P12 and P14's
 * SD4): PostgresIdentityRepository.createPendingAccount, on the API's sign-up principal, calls
 * identity.record_signup_italy_approval (migration 0125) inside the transaction that creates the account, only when
 * the input carries an approval; the export adapter reads that row back through identity.read_data_export_snapshot_v2.
 */
let database: TestDatabase;
let signupPool: Pool;
let workerPool: Pool;
let repository: PostgresIdentityRepository;
const recordsKey = randomBytes(32);
const blindKey = Buffer.alloc(32, 0x5d);
const hasher = { hashSourceIp: async () => "33".repeat(32), hashUserAgent: async () => "44".repeat(32) } as unknown as AuditContextHasher;
const CLAUSES = [...ITALY_APPROVAL_CLAUSES];
const EVIDENCE = { ip: "93.40.7.8", user_agent: "italy-signup/1" };
const EVIDENCE_AAD = (rowId: string) => ({ table: "legal.acceptance", column: "evidence_ciphertext", rowId });

const sealed = (acceptanceId: string) => sealRecord(recordsKey, EVIDENCE_AAD(acceptanceId), Buffer.from(JSON.stringify(EVIDENCE)));
/** The three sign-up rows, each with its own version and digest, so a copied pair shows which row it came from. */
function signUpRows(): SignUpAcceptanceRow[] {
  const documents = { ADULT: ["2.2", "a"], TERMS: ["2.3", "b"], PRIVACY_SHOWN: ["3.4", "c"] } as const;
  return (["ADULT", "TERMS", "PRIVACY_SHOWN"] as const).map((kind) => {
    const acceptanceId = randomUUID();
    const evidence = sealed(acceptanceId);
    return { acceptanceId, kind, documentVersion: documents[kind][0], documentSha256: documents[kind][1].repeat(64), locale: "it",
      evidenceCiphertext: evidence.ciphertext, keyId: evidence.keyId };
  });
}
/** The approval as the API builds it (apps/api/src/legal.ts italyApprovalRow): its own id, evidence sealed to that id. */
function approval(leg: ItalyApprovalLeg): ItalyApprovalAcceptanceRow {
  const acceptanceId = randomUUID();
  const evidence = sealed(acceptanceId);
  return { acceptanceId, clauses: CLAUSES, leg, evidenceCiphertext: evidence.ciphertext, keyId: evidence.keyId };
}
function pendingInput(extra: Partial<Pick<PendingAccountInput, "acceptances" | "italyApproval">>, email = `${randomUUID()}@example.test`): PendingAccountInput {
  const userId = randomUUID();
  const dek = generateDek();
  const keyId = `user-dek:${userId}`;
  return {
    userId, emailBlindIndex: createEmailBlindIndex(blindKey, email),
    emailCiphertext: encrypt(dek, Buffer.from(email), ["identity", "user.email_ciphertext", userId, "run:none", userId, keyId, "1"]),
    recoveryEmailCiphertext: null,
    phoneCiphertext: null, phoneSource: null, phoneVerificationStatus: null, phoneUpdatedAt: null,
    passwordHash: `$argon2id$v=19$m=65536,t=3,p=1$${"A".repeat(22)}$${"A".repeat(43)}`,
    pseudonym: `italy-signup-${userId}`,
    adultAffirmedAt: new Date(), ageCheck: { minAgeApplied: MIN_AGE, countryCode: "IT", ruleVersion: AGE_RULE_VERSION },
    verificationTokenHash: `sha256:${createHash("sha256").update(userId).digest("hex")}`,
    verificationExpiresAt: new Date(Date.now() + 86_400_000), occurredAt: new Date(),
    source: { ip: EVIDENCE.ip, userAgent: EVIDENCE.user_agent, requestId: randomUUID() },
    declaredRegion: { country: "IT", usState: null },
    ...extra
  };
}
type AcceptanceRow = { acceptance_id: string; kind: string; document_version: string; document_sha256: string; locale: string; surface: string;
  accepted_at: Date; evidence_ciphertext: Buffer; clauses: number[] | null; leg: string | null };
const acceptances = async (userId: string): Promise<AcceptanceRow[]> => (await database.pool.query<AcceptanceRow>(`
  SELECT a.acceptance_id,a.kind,a.document_version,a.document_sha256::text AS document_sha256,a.locale,a.surface,a.accepted_at,
    a.evidence_ciphertext,a.clauses,a.leg
  FROM legal.acceptance a JOIN identity."user" u ON u.owner_ref=a.owner_ref WHERE u.user_id=$1 ORDER BY a.kind`, [userId])).rows;
const loginPool = (role: string, password: string): Pool => {
  const url = new URL(database.connectionString);
  url.username = role;
  url.password = password;
  return createPool(url.toString());
};

let sd1: PendingAccountInput;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  // The API's sign-up principal, as social-auth-journey.test.ts builds it (social_registration).
  await database.pool.query("CREATE ROLE italy_registration LOGIN PASSWORD 'italy-registration-test-only' IN ROLE debateai_runtime,debateai_billing_runtime");
  await database.pool.query("CREATE ROLE italy_export_worker LOGIN PASSWORD 'italy-export-worker-test-only' IN ROLE debateai_data_export_worker");
  signupPool = loginPool("italy_registration", "italy-registration-test-only");
  workerPool = loginPool("italy_export_worker", "italy-export-worker-test-only");
  expect((await signupPool.query("SELECT current_user AS name")).rows[0].name).toBe("italy_registration");
  expect((await workerPool.query("SELECT current_user AS name")).rows[0].name).toBe("italy_export_worker");
  repository = new PostgresIdentityRepository(signupPool, hasher);
}, 180_000);
afterAll(async () => { await signupPool?.end(); await workerPool?.end(); await database?.stop(); });

describe("the email sign-up adapter writes the Italy approval in the account's transaction", () => {
  it("SD1 writes the fourth row, ITALY_SPECIFIC_APPROVAL, beside the three sign-up rows, from the TERMS row", async () => {
    const italy = approval("PICKED");
    sd1 = pendingInput({ acceptances: signUpRows(), italyApproval: italy });
    let committed = false;
    expect((await repository.createPendingAccount(sd1, async () => { committed = true; })).status).toBe("created");
    expect(committed).toBe(true);
    const rows = await acceptances(sd1.userId);
    expect(rows.map((row) => row.kind)).toEqual(["ADULT", ITALY_APPROVAL_KIND, "PRIVACY_SHOWN", "TERMS"]);
    const terms = rows.find((row) => row.kind === "TERMS")!;
    const row = rows.find((candidate) => candidate.kind === ITALY_APPROVAL_KIND)!;
    expect(row).toMatchObject({ acceptance_id: italy.acceptanceId, surface: "SIGN_UP", clauses: CLAUSES, leg: "PICKED",
      document_version: terms.document_version, document_sha256: terms.document_sha256, locale: terms.locale, accepted_at: terms.accepted_at });
    // The TERMS row's own pair (2.3 / b…), not ADULT's or PRIVACY_SHOWN's.
    expect([row.document_version, row.document_sha256]).toEqual(["2.3", "b".repeat(64)]);
    // The evidence is the approval's own, sealed to its id: it opens under the records key to {ip, user_agent}.
    expect(row.evidence_ciphertext).toEqual(italy.evidenceCiphertext);
    expect(JSON.parse(openRecord(recordsKey, EVIDENCE_AAD(row.acceptance_id), row.evidence_ciphertext).toString("utf8"))).toEqual(EVIDENCE);
  });

  it("SD2 writes exactly the three sign-up kinds when the input carries no approval", async () => {
    const input = pendingInput({ acceptances: signUpRows() });
    expect((await repository.createPendingAccount(input, async () => undefined)).status).toBe("created");
    const rows = await acceptances(input.userId);
    expect(rows.map((row) => row.kind)).toEqual(["ADULT", "PRIVACY_SHOWN", "TERMS"]);
    expect(rows.map((row) => [row.clauses, row.leg])).toEqual([[null, null], [null, null], [null, null]]);
  });

  it("SD3 a refused approval rolls the whole account back: no user, no region, no acceptance row", async () => {
    const nothingFor = async (input: PendingAccountInput, ids: readonly string[]) => {
      expect((await database.pool.query(`SELECT
          (SELECT count(*)::int FROM identity."user" WHERE user_id=$1) AS users,
          (SELECT count(*)::int FROM identity.registration_region WHERE user_id=$1) AS regions,
          (SELECT count(*)::int FROM legal.acceptance WHERE acceptance_id = ANY($2::uuid[])) AS acceptances`,
      [input.userId, ids])).rows[0]).toEqual({ users: 0, regions: 0, acceptances: 0 });
    };
    // The TypeScript guard: an approval without the three rows is refused, after the account insert, in its transaction.
    const unpaired = pendingInput({ italyApproval: approval("IP") });
    let committed = false;
    await expect(repository.createPendingAccount(unpaired, async () => { committed = true; })).rejects.toThrow("ITALY_APPROVAL_WITHOUT_ACCEPTANCES");
    expect(committed).toBe(false);
    await nothingFor(unpaired, [unpaired.italyApproval!.acceptanceId]);
    // A leg the table refuses: the call passes the TypeScript guard (the three rows are given), EXECUTE (42501) and the
    // writer's four guards (ITALY_APPROVAL_INVALID, _ACCOUNT_INVALID, _TERMS_MISSING, _DUPLICATE), and stops at the CHECK.
    const rows = signUpRows();
    const bad = { ...approval("PICKED"), leg: "X" as ItalyApprovalLeg };
    const input = pendingInput({ acceptances: rows, italyApproval: bad });
    await expect(repository.createPendingAccount(input, async () => { committed = true; }))
      .rejects.toMatchObject({ code: "23514", constraint: "acceptance_italy_fields" });
    expect(committed).toBe(false);
    await nothingFor(input, [...rows.map((row) => row.acceptanceId), bad.acceptanceId]);
  });

  it("SD4 the export adapter reads the approval through v2: the Italy row carries the clauses, the others null", async () => {
    const owner = (await database.pool.query(`SELECT owner_ref FROM identity."user" WHERE user_id=$1`, [sd1.userId])).rows[0].owner_ref as string;
    const exportId = randomUUID(), worker = randomUUID();
    await database.pool.query(`INSERT INTO identity.data_export(export_id,user_id,session_id,locale,status,requested_at,attempts,lease_owner,lease_until)
      VALUES($1,$2,$3,'it','PREPARING',clock_timestamp(),1,$4,clock_timestamp()+interval '45 seconds')`, [exportId, sd1.userId, randomUUID(), worker]);
    try {
      const raw = await new PostgresDataExportSource(workerPool).readRaw(exportId, worker);
      const exported = raw.legal_acceptances as unknown as ReadonlyArray<Record<string, unknown>>;
      const stored = await database.pool.query<{ acceptance_id: string; kind: string }>(
        "SELECT acceptance_id,kind FROM legal.acceptance WHERE owner_ref=$1", [owner]);
      expect(exported.map((item) => item.acceptance_id).sort()).toEqual(stored.rows.map((row) => row.acceptance_id).sort());
      expect(exported.map((item) => [item.kind, item.clauses, item.leg]).sort()).toEqual([
        ["ADULT", null, null], [ITALY_APPROVAL_KIND, CLAUSES, "PICKED"], ["PRIVACY_SHOWN", null, null], ["TERMS", null, null]
      ]);
      expect(exported.find((item) => item.kind === ITALY_APPROVAL_KIND)!.acceptance_id).toBe(sd1.italyApproval!.acceptanceId);
    } finally {
      await database.pool.query("UPDATE identity.data_export SET status='CANCELLED',closed_at=clock_timestamp(),lease_owner=NULL,lease_until=NULL WHERE export_id=$1", [exportId]);
    }
  });

  it("SD5 an email_duplicate outcome writes no Italy row, on either account", async () => {
    const email = `${randomUUID()}@example.test`;
    const first = pendingInput({ acceptances: signUpRows() }, email);
    expect((await repository.createPendingAccount(first, async () => undefined)).status).toBe("created");
    const italy = approval("BOTH");
    const second = pendingInput({ acceptances: signUpRows(), italyApproval: italy }, email);
    expect(await repository.createPendingAccount(second, async () => undefined)).toEqual({ status: "email_duplicate", userId: first.userId });
    // The pending first account would accept an approval (it holds one TERMS row and none yet): none was written to it.
    expect((await acceptances(first.userId)).map((row) => row.kind)).toEqual(["ADULT", "PRIVACY_SHOWN", "TERMS"]);
    expect((await database.pool.query("SELECT count(*)::int AS n FROM legal.acceptance WHERE acceptance_id=$1", [italy.acceptanceId])).rows[0].n).toBe(0);
    expect((await database.pool.query(`SELECT count(*)::int AS n FROM identity."user" WHERE user_id=$1`, [second.userId])).rows[0].n).toBe(0);
  });
});
