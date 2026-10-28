/**
 * Row-level security S01 — `pnpm run rls:proof` (PLAN S8.3; SPEC-v4 R7-R9, R14, R38-R40, A6; DECISIONS D8, D62) and
 * the test-account seam behind `pnpm run rls:test-accounts` (PLAN S8.2; SPEC-v4 R43; DECISIONS D44, D57, D68).
 *
 * Why the seam lives in this file (finding F-C8-1, measured): the source audit refuses an engine file whose import
 * specifier matches /(?:tests?|fixtures?)/ (tools/orphan-audit/src/index.ts:740-747, tools/ included at :755-757;
 * tests/architecture/scaffold.test.ts:190-197 pins its output), so neither the CLI nor this proof may import
 * "./test-accounts.js". tools/rls/test-accounts.ts re-exports the seam from here, under the name PLAN §0.3 gives it.
 *
 * The seam, `createRlsTestAccounts(pools, { custodyRoot, registerVersion })`, drives the product's own services for a
 * finished sign-up — RegistrationService (sign-up with the current Terms and Privacy pair, region and age, then the
 * e-mail check), MfaEnrollmentService (TOTP active), SessionService and ConsumerSecurityService (recovery codes issued
 * after a step-up, as Settings issues them), the sensitive-data consent the consent dialog records — on the
 * repositories apps/api/src/main.ts builds on `pool` and `authorizationPool`. Its pools are T1 pools with a
 * cross-account target and it runs outside any request scope, so every statement runs on the system logins (D57). It
 * writes one 0600 file under the custody root and returns only labels, e-mails and user ids.
 *
 * The proof, `runRlsProof({ emulateBase, out })`, starts its own throwaway embedded PostgreSQL, migrates it with the
 * head's migrate(), provisions the four T1 logins with the product's provisioners, makes A and B with the seam, signs
 * each in through SessionService (R38's live sessions; B twice more for R9's revoked and expired tokens), seeds rows of
 * both in every in-scope table (tools/rls/seed.ts), then, as each T1 login on its own connection (T9), checks R7, R8, R9
 * and F1-F8 on every in-scope relation that login may SELECT, prints R39's lines and deletes the cluster and every file.
 * A returned row is the account's own when its primary key is one the seed wrote for the account (or a mixed row,
 * F-SEC-1), or when its text names one of the account's identifiers (user id, owner_ref, a run it owns now, a session,
 * a seeded key); under no context or a forged one every returned row counts as private (the slice adds no public-read
 * policy, so a T1 login reading an in-scope relation directly reads no public row). `emulateBase` turns row security
 * off on the in-scope tables right after migrate() — the base, which has none — so the proof must fail.
 */
import { randomBytes } from "node:crypto";
import { realpathSync } from "node:fs";
import { chmod, lstat, mkdir, mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { SENSITIVE_DATA_NOTICE_VERSION } from "@debateai/contract";
import {
  Argon2WorkerPool,
  AuditContextHasher,
  decodeBase32,
  destroyKek,
  FileUserDekStore,
  loadKekRing,
  loadSecretKey,
  totpCodeAtStep
} from "@debateai/crypto";
import {
  createPool,
  migrate,
  PostgresAuthenticationRiskSignalRepository,
  PostgresConsumerAuthRepository,
  PostgresConsumerSecurityRepository,
  PostgresIdentityRepository,
  PostgresSessionRepository,
  type Pool
} from "@debateai/db";
import { currentDocument } from "@debateai/legal-manifest";
import {
  loadBootstrapRegister,
  persistBootstrapRegister,
  readAuthPolicy,
  readMfaPolicy,
  readRecoveryPolicy,
  readSessionPolicy
} from "@debateai/register";
import { ConsumerSecurityService } from "../../apps/api/src/consumer-security.js";
import { MemoryMailSender } from "../../apps/api/src/mail-channel.js";
import { MfaEnrollmentService } from "../../apps/api/src/mfa.js";
import { InProcessAuthRateLimiter, RegistrationService } from "../../apps/api/src/registration.js";
import { SessionService, type AuthenticatedSession } from "../../apps/api/src/sessions.js";
import { RLS_DEVELOPMENT_AUTH_STACK_PROFILE } from "../../apps/runner/src/dev-auth-stack-profile.js";
import { provisionDevelopmentDatabasePrincipals } from "../../apps/runner/src/dev-database-principals.js";
import {
  PRODUCTION_DATABASE_PRINCIPAL_CREDENTIAL_FORMAT,
  provisionProductionDatabasePrincipals
} from "../../apps/runner/src/production-database-principals.js";
import { seedRlsRows, type RlsSeedReport } from "./seed.js";

const PRODUCT_ROOT = fileURLToPath(new URL("../../", import.meta.url));

// ─── The test-account seam (S8.2) ──────────────────────────────────────────────────────────────────────────────────

/** The two T1 pools main.ts builds as `pool` and `authorizationPool` (each with its system login as target). */
export type RlsAccountPools = Readonly<{ runtime: Pool; authorization: Pool }>;
export type RlsTestAccountsOptions = Readonly<{ custodyRoot: string; registerVersion: number }>;
export type RlsTestAccountRecord = Readonly<{ label: "A" | "B"; email: string; userId: string }>;
export type RlsTestAccountsFile = Readonly<{
  path: string;
  accounts: readonly [RlsTestAccountRecord, RlsTestAccountRecord];
}>;

/** The 0600 file the seam writes under the custody root; V reads it at TEST (SPEC-v4 P3). */
export const RLS_TEST_ACCOUNTS_FILE_NAME = "rls-test-accounts.env";
const ACCOUNT_LABELS = Object.freeze(["A", "B"] as const);
const SEAM_SOURCE = Object.freeze({ ip: "127.0.0.1", userAgent: "debateai-rls-test-accounts", requestId: "rls-test-accounts" });

/** The product services the seam drives, composed as apps/api/src/main.ts composes them on the two pools. */
export type RlsAccountServices = Readonly<{
  registration: RegistrationService;
  mail: MemoryMailSender;
  sessions: SessionService;
  mfa: MfaEnrollmentService;
  security: ConsumerSecurityService;
  totpPeriodSeconds: number;
  close(): Promise<void>;
}>;

async function privateCustodyRoot(candidate: string): Promise<string> {
  const root = resolve(candidate);
  const facts = await lstat(root).catch(() => null);
  if (facts === null || !facts.isDirectory() || facts.isSymbolicLink() || (facts.mode & 0o777) !== 0o700) {
    throw new TypeError("RLS_TEST_ACCOUNTS_CUSTODY_INVALID");
  }
  return root;
}

/**
 * The services of main.ts on `pools`, with the custody root's own secret files (apps/runner/src/dev-api-environment.ts
 * names them: secrets/kek.bin, secrets/blind-index-key.bin, secrets/audit-source-ip-salt.bin, secrets/records-key.bin,
 * user-deks) and the policies of `registerVersion`. The caller closes it.
 */
export async function openRlsAccountServices(pools: RlsAccountPools, options: RlsTestAccountsOptions): Promise<RlsAccountServices> {
  const root = await privateCustodyRoot(options.custodyRoot);
  const [authPolicy, mfaPolicy, sessionPolicy, recoveryPolicy] = await Promise.all([
    readAuthPolicy(pools.runtime, options.registerVersion),
    readMfaPolicy(pools.runtime, options.registerVersion),
    readSessionPolicy(pools.runtime, options.registerVersion),
    readRecoveryPolicy(pools.runtime, options.registerVersion)
  ]);
  const keks = loadKekRing(join(root, "secrets", "kek.bin"), undefined);
  const blindIndexKey = loadSecretKey(join(root, "secrets", "blind-index-key.bin"));
  const sourceIpSalt = loadSecretKey(join(root, "secrets", "audit-source-ip-salt.bin"));
  const recordsKey = loadSecretKey(join(root, "secrets", "records-key.bin"));
  const dekStore = new FileUserDekStore(join(root, "user-deks"), keks);
  const argon2 = new Argon2WorkerPool();
  const wipe = (): void => {
    destroyKek(keks.current);
    blindIndexKey.fill(0);
    sourceIpSalt.fill(0);
    recordsKey.fill(0);
  };
  try {
    await argon2.ready();
    const audit = new AuditContextHasher(argon2, sourceIpSalt, authPolicy.auditSourceIpKdf);
    const identity = new PostgresIdentityRepository(pools.runtime, audit);
    const mail = new MemoryMailSender();
    const registration = new RegistrationService({
      repository: identity,
      mail,
      dekStore,
      blindIndexKey,
      policy: authPolicy,
      limiter: new InProcessAuthRateLimiter(authPolicy.rateLimits, authPolicy.rateLimitBucketCapacity,
        authPolicy.rateLimitRefusalAuditIntervalMs),
      argon2,
      legalAcceptance: { recordsKey }
    });
    const sessions = await SessionService.create({
      repository: new PostgresSessionRepository(pools.authorization, audit),
      riskSignals: new PostgresAuthenticationRiskSignalRepository(pools.runtime, audit, dekStore,
        recoveryPolicy.riskSignals.rawSignalRetentionMs, recoveryPolicy.riskSignals.maximumEvaluatorSignals),
      onRiskSignalFailure: () => undefined,
      dekStore,
      argon2,
      authPolicy,
      mfaPolicy,
      sessionPolicy,
      blindIndexKey
    });
    const mfa = new MfaEnrollmentService({
      repository: identity,
      consumerRepository: new PostgresConsumerAuthRepository(pools.authorization, audit),
      sessions: sessions.consumerProducer(),
      dekStore,
      argon2,
      policy: mfaPolicy
    });
    const security = new ConsumerSecurityService(new PostgresConsumerSecurityRepository(pools.authorization, audit),
      sessions.consumerProducer(), { publicAppUrl: `${RLS_DEVELOPMENT_AUTH_STACK_PROFILE.publicOrigin}/`, argon2, mfaPolicy, authPolicy });
    let closed = false;
    return Object.freeze({
      registration, mail, sessions, mfa, security,
      totpPeriodSeconds: mfaPolicy.totp.periodSeconds,
      close: async () => {
        if (closed) return;
        closed = true;
        audit.close();
        await argon2.close();
        wipe();
      }
    });
  } catch (error) {
    await argon2.close().catch(() => undefined);
    wipe();
    throw error;
  }
}

function totpStep(periodSeconds: number): number {
  return Math.floor(Date.now() / (periodSeconds * 1_000));
}

/** Resolves at the first TOTP step after `step` (a code is accepted once per step, `matchTotpStep`). */
export async function rlsWaitForTotpStepAfter(step: number, periodSeconds: number): Promise<number> {
  for (;;) {
    const now = totpStep(periodSeconds);
    if (now > step) return now;
    await new Promise((resolveWait) => setTimeout(resolveWait, (now + 1) * periodSeconds * 1_000 - Date.now() + 50));
  }
}

type EnrolledAccount = Readonly<{
  label: "A" | "B";
  email: string;
  password: string;
  otpauthUri: string;
  secret: Buffer;
  step: number;
  session: AuthenticatedSession;
}>;

async function enrolAccount(services: RlsAccountServices, label: "A" | "B"): Promise<EnrolledAccount> {
  const email = `rls-${label.toLowerCase()}-${randomBytes(6).toString("hex")}@example.test`;
  const password = randomBytes(24).toString("base64url");
  const terms = currentDocument("TERMS", "en"), privacy = currentDocument("PRIVACY", "en");
  if (terms === null || privacy === null) throw new TypeError("RLS_TEST_ACCOUNTS_LEGAL_DOCUMENT_MISSING");
  await services.registration.register({ email, password, recoveryEmail: null, phone: null, adultAffirmed: true }, {
    ...SEAM_SOURCE, countryCode: "RO", region: { country: "RO", usState: null },
    legal: { locale: "en", terms, privacy }
  });
  await services.registration.drainMailDispatches();
  const token = services.mail.messages.find((mail) => mail.recipient === email)?.token;
  if (token === undefined) throw new TypeError("RLS_TEST_ACCOUNTS_VERIFICATION_MAIL_MISSING");
  await services.registration.verifyEmail({ token }, SEAM_SOURCE);
  const begun = await services.mfa.beginTotp({ enrollmentToken: token }, SEAM_SOURCE);
  const secret = decodeBase32(begun.secret);
  const step = totpStep(services.totpPeriodSeconds);
  const enrolled = await services.mfa.verifyTotp({ enrollmentToken: token, code: totpCodeAtStep(secret, step) }, SEAM_SOURCE);
  if (!("sessionToken" in enrolled)) throw new TypeError("RLS_TEST_ACCOUNTS_ENROLMENT_INCOMPLETE");
  const session = await services.sessions.authenticate(enrolled.sessionToken, SEAM_SOURCE);
  if (session === null) throw new TypeError("RLS_TEST_ACCOUNTS_SESSION_MISSING");
  // The consent dialog's call (POST /v1/account/sensitive-data-consent, apps/api/src/index.ts): the notice version
  // the API records, from the account's live session.
  if (await services.sessions.recordSensitiveDataConsent(session,
    { noticeVersion: SENSITIVE_DATA_NOTICE_VERSION, locale: "en" }) !== "given") {
    throw new TypeError("RLS_TEST_ACCOUNTS_CONSENT_NOT_RECORDED");
  }
  return Object.freeze({ label, email, password, otpauthUri: begun.otpauthUri, secret, step, session });
}

/** Settings' recovery-code issue: a step-up with the password and a fresh TOTP code, then the codes; then sign-out. */
async function issueRecoveryCodes(services: RlsAccountServices, account: EnrolledAccount, step: number): Promise<readonly string[]> {
  const stepped = await services.sessions.stepUp({
    session: account.session, password: account.password, code: totpCodeAtStep(account.secret, step),
    authorization: { action: "REGENERATE_RECOVERY_CODES" }
  }, SEAM_SOURCE);
  const session = await services.sessions.authenticate(stepped.sessionToken, SEAM_SOURCE);
  if (session === null || stepped.grantToken === undefined) throw new TypeError("RLS_TEST_ACCOUNTS_STEP_UP_FAILED");
  const { codes } = await services.security.regenerateRecoveryCodes({ step_up_grant: stepped.grantToken }, session, SEAM_SOURCE);
  await services.sessions.logout(session, SEAM_SOURCE);
  if (codes.length < 2) throw new TypeError("RLS_TEST_ACCOUNTS_RECOVERY_CODES_MISSING");
  return codes;
}

/**
 * Creates accounts A and B (SPEC-v4 R43) and writes their sign-in details to `<custodyRoot>/rls-test-accounts.env`
 * (mode 0600, created new: an existing file is refused before any account is made). Returns no secret.
 */
export async function createRlsTestAccounts(pools: RlsAccountPools, options: RlsTestAccountsOptions): Promise<RlsTestAccountsFile> {
  const root = await privateCustodyRoot(options.custodyRoot);
  const path = join(root, RLS_TEST_ACCOUNTS_FILE_NAME);
  if (await lstat(path).then(() => true, () => false)) throw new TypeError("RLS_TEST_ACCOUNTS_FILE_EXISTS");
  const services = await openRlsAccountServices(pools, { ...options, custodyRoot: root });
  try {
    const enrolled: EnrolledAccount[] = [];
    for (const label of ACCOUNT_LABELS) enrolled.push(await enrolAccount(services, label));
    const step = await rlsWaitForTotpStepAfter(Math.max(...enrolled.map((account) => account.step)), services.totpPeriodSeconds);
    const lines: string[] = [];
    for (const account of enrolled) {
      const codes = await issueRecoveryCodes(services, account, step);
      lines.push(`RLS_${account.label}_EMAIL=${account.email}`, `RLS_${account.label}_PASSWORD=${account.password}`,
        `RLS_${account.label}_OTPAUTH_URI=${account.otpauthUri}`, `RLS_${account.label}_RECOVERY_CODE_1=${codes[0]}`,
        `RLS_${account.label}_RECOVERY_CODE_2=${codes[1]}`);
      account.secret.fill(0);
    }
    const handle = await open(path, "wx", 0o600);
    try {
      await handle.writeFile(`${lines.join("\n")}\n`, "utf8");
    } finally {
      await handle.close();
    }
    await chmod(path, 0o600);
    const [a, b] = enrolled.map((account) => Object.freeze({
      label: account.label, email: account.email, userId: account.session.userId
    })) as [RlsTestAccountRecord, RlsTestAccountRecord];
    return Object.freeze({ path, accounts: Object.freeze([a, b] as const) });
  } finally {
    await services.close();
  }
}

/** One account's sign-in details, read back from the seam's file. */
export type RlsTestAccountSecrets = Readonly<{ email: string; password: string; otpauthUri: string; recoveryCodes: readonly [string, string] }>;

export async function readRlsTestAccountsFile(path: string): Promise<Readonly<Record<"A" | "B", RlsTestAccountSecrets>>> {
  const values = new Map((await readFile(path, "utf8")).split("\n").filter((line) => line !== "").map((line) => {
    const at = line.indexOf("=");
    return [line.slice(0, at), line.slice(at + 1)] as const;
  }));
  const read = (key: string): string => {
    const value = values.get(key);
    if (value === undefined || value === "") throw new TypeError("RLS_TEST_ACCOUNTS_FILE_INVALID");
    return value;
  };
  const one = (label: "A" | "B"): RlsTestAccountSecrets => Object.freeze({
    email: read(`RLS_${label}_EMAIL`), password: read(`RLS_${label}_PASSWORD`), otpauthUri: read(`RLS_${label}_OTPAUTH_URI`),
    recoveryCodes: Object.freeze([read(`RLS_${label}_RECOVERY_CODE_1`), read(`RLS_${label}_RECOVERY_CODE_2`)] as const)
  });
  return Object.freeze({ A: one("A"), B: one("B") });
}

// ─── The proof (S8.3) ──────────────────────────────────────────────────────────────────────────────────────────────

/** R39's logins, in R39's order. */
const PROOF_LOGINS = Object.freeze([
  Object.freeze({ login: "debateai_prod_api_runtime", production: "api-runtime" }),
  Object.freeze({ login: "debateai_prod_api_authorization", production: "api-authorization" }),
  Object.freeze({ login: "debateai_dev_runtime", development: "DATABASE_URL" }),
  Object.freeze({ login: "debateai_dev_authorization", development: "AUTHORIZATION_DATABASE_URL" })
] as const);

/** The six relations L5-F12 names (SPEC-v4 R38). */
const L5F12_RELATIONS = Object.freeze(["core.run", "serve.answer", "identity.user", "identity.session",
  "identity.mfa_factor", "identity.recovery_code"] as const);

/** `probes/REQ-RLS/rule.sql` (SPEC-v4 R1), the copy tests/support/rls-scope.ts holds verbatim; run as the superuser. */
const RLS_SCOPE_RULE_SQL = `WITH api(role) AS (VALUES ('debateai_billing_runtime'), ('debateai_authorization_runtime')),
excluded(relation) AS (VALUES
  ('billing.tool_order'), ('ledger.model_spend_reservation'), ('ledger.sequence_allocator'),
  ('register.register_row'), ('register.register_version'), ('register.required_row'), ('register.required_row_version'),
  ('scorecard.model_identity'), ('scorecard.scorecard_cell'))
SELECT n.nspname || '.' || c.relname AS relation, c.relkind::text AS kind, c.relrowsecurity AS rls,
       c.relforcerowsecurity AS force_rls, pg_get_userbyid(c.relowner) AS owner
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg\\_%'
  AND EXISTS (SELECT 1 FROM api WHERE has_schema_privilege(api.role, n.oid, 'USAGE')
                                  AND has_any_column_privilege(api.role, c.oid, 'SELECT'))
  AND n.nspname || '.' || c.relname NOT IN (SELECT relation FROM excluded)
ORDER BY 1`;

const CREDENTIAL_SETTING = "debateai.session_credential";
const SUPERUSER = "debateai";
const PROOF_DATABASE = "debateai_rls_proof";
const PRODUCTION_ADMIN_ROLE = "debateai_prod_migrator";
const PRODUCTION_DATABASE = "debateai";
const PRODUCTION_MANIFEST_PATH = join(PRODUCT_ROOT,
  "docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json");
const PROOF_SOURCE = Object.freeze({ ip: "127.0.0.1", userAgent: "debateai-rls-proof", requestId: "rls-proof" });
/** Identifiers a returned row may name: UUIDs and hex keys (never a short constant shared by both accounts). */
const IDENTIFIER = /^[0-9a-f][0-9a-f-]{15,}$/iu;

type Cleanup = Array<() => Promise<unknown>>;
type Mode = "A" | "none";
type ReadPlan = Readonly<{ relation: string; sql: string }>;
type ReadTally = { rows: number; foreign: number; own: number; errors: number };
type AccountFacts = Readonly<{
  userId: string; ownerRef: string; liveToken: string; sessionIds: readonly string[]; runIds: readonly string[];
  executionRefs: readonly string[];
}>;

class ProofFailures {
  readonly lines = new Set<string>();
  constructor(private readonly out: (line: string) => void) {}
  fail(login: string, subject: string, requirement: string): void {
    const line = `RLS_PROOF_FAILED ${login} ${subject} ${requirement}`;
    if (this.lines.has(line)) return;
    this.lines.add(line);
    this.out(line);
  }
}

/**
 * A refusal code safe to print (R40): an SQLSTATE or an upper-case code, never a message that could carry a value, and
 * cut to 40 characters so no printed run reaches the 43 characters of a token (R40's check, /[A-Za-z0-9_-]{43}/).
 */
function failureCode(error: unknown): string {
  const candidate = error as { code?: unknown; message?: unknown };
  const code = typeof candidate?.code === "string" && /^[A-Z0-9_]{1,64}$/u.test(candidate.code) ? candidate.code
    : typeof candidate?.message === "string" && /^[A-Z][A-Z0-9_]{2,63}$/u.test(candidate.message) ? candidate.message : "ERROR";
  return code.slice(0, 40);
}

async function privateTemporaryDirectory(prefix: string, cleanup: Cleanup): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  await chmod(directory, 0o700);
  return directory;
}

async function reservePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close(() => reject(new TypeError("RLS_PROOF_PORT_UNRESOLVED")));
        return;
      }
      server.close((error) => error === undefined ? resolvePort(address.port) : reject(error));
    });
  });
}

/** tests/support/testDatabase.ts's embedded cluster (startTestDatabase), with its own superuser password and no log. */
async function startThrowawayCluster(cleanup: Cleanup): Promise<string> {
  const directory = await privateTemporaryDirectory("debateai-rls-proof-", cleanup);
  const port = await reservePort();
  const password = randomBytes(24).toString("base64url");
  // Loaded here, not at the top: its exit hook (async-exit-hook) ends the process with code 0 on beforeExit, which
  // would erase the CLI's exit code and unflushed stdout (measured: `process.exitCode = 2` after importing it exits 0).
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const embedded = new EmbeddedPostgres({
    databaseDir: join(directory, "data"),
    user: SUPERUSER,
    password,
    port,
    persistent: false,
    initdbFlags: ["--encoding=UTF8", "--set=shared_memory_type=mmap", "--set=dynamic_shared_memory_type=mmap"],
    postgresFlags: ["-c", "shared_memory_type=mmap", "-c", "dynamic_shared_memory_type=mmap", "-c", "lc_messages=C"],
    onLog: () => undefined,
    onError: () => undefined
  });
  cleanup.push(() => embedded.stop());
  await embedded.initialise();
  await embedded.start();
  await embedded.createDatabase(PROOF_DATABASE);
  return `postgresql://${SUPERUSER}:${password}@127.0.0.1:${port}/${PROOF_DATABASE}`;
}

function readEnvironmentFile(source: string): ReadonlyMap<string, string> {
  return new Map(source.split("\n").filter((line) => line !== "").map((line) => {
    const at = line.indexOf("=");
    return [line.slice(0, at), line.slice(at + 1)] as const;
  }));
}

/** The production logins, as tests/support/rls-logins.ts provisions them: on their own `debateai` database, then pointed at ours. */
async function provisionProductionLogins(superuser: Pool, superuserUrl: string, cleanup: Cleanup): Promise<ReadonlyMap<string, string>> {
  const harness = new URL(superuserUrl);
  const adminPassword = randomBytes(32).toString("base64url");
  const client = await superuser.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL password_encryption='scram-sha-256'");
    // The provisioner admits an admin credential valid for at most 15 minutes (production-database-principals.ts:630-633).
    const statement = (await client.query<{ statement: string }>(`SELECT format(
        'CREATE ROLE %I LOGIN INHERIT SUPERUSER CREATEDB CREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L VALID UNTIL %L',
        $1::text,$2::text,$3::text) AS statement`,
    [PRODUCTION_ADMIN_ROLE, adminPassword, new Date(Date.now() + 12 * 60_000).toISOString()])).rows[0]!.statement;
    await client.query(statement);
    await client.query("COMMIT");
    await client.query(`CREATE DATABASE ${PRODUCTION_DATABASE} OWNER ${PRODUCTION_ADMIN_ROLE}`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  const admin = new URL(harness);
  admin.username = PRODUCTION_ADMIN_ROLE;
  admin.password = adminPassword;
  admin.pathname = `/${PRODUCTION_DATABASE}`;
  const adminDatabaseUrl = admin.toString();
  const adminPool = createPool(adminDatabaseUrl, { max: 2 });
  try {
    await migrate(adminPool);
    const manifest = JSON.parse(await readFile(PRODUCTION_MANIFEST_PATH, "utf8")) as Readonly<{
      provisioner: Readonly<{ managedPrincipalIds: readonly string[] }>;
      principals: readonly Readonly<{ id: string; roleName: string }>[];
    }>;
    const roleOf = new Map(manifest.principals.map(({ id, roleName }) => [id, roleName]));
    const humanValidUntil = new Date(Date.now() + 10 * 60_000).toISOString();
    const credentials = manifest.provisioner.managedPrincipalIds.map((principalId) => {
      const url = new URL(adminDatabaseUrl);
      url.username = roleOf.get(principalId)!;
      url.password = randomBytes(32).toString("base64url");
      return {
        principalId,
        databaseUrl: url.toString(),
        ...(principalId === "obs-human" || principalId === "support-config-operator" ? { validUntil: humanValidUntil } : {})
      };
    });
    const custody = await privateTemporaryDirectory("debateai-rls-proof-production-", cleanup);
    await provisionProductionDatabasePrincipals({
      adminPool,
      adminDatabaseUrl,
      manifest,
      credentialEnvelope: { format: PRODUCTION_DATABASE_PRINCIPAL_CREDENTIAL_FORMAT, credentials },
      supportConfigCredentialFilePath: join(custody, "support-config-operator.json")
    });
    return new Map(credentials.map(({ principalId, databaseUrl }) => {
      const url = new URL(databaseUrl);
      url.pathname = harness.pathname;
      return [principalId, url.toString()] as const;
    }));
  } finally {
    await adminPool.end();
  }
}

/** The custody layout apps/runner/src/dev-secret-files.ts writes: the four secret files the seam reads, and the DEK store. */
async function throwawayCustodyRoot(cleanup: Cleanup): Promise<string> {
  const root = await privateTemporaryDirectory("debateai-rls-proof-custody-", cleanup);
  for (const directory of ["secrets", "user-deks"]) await mkdir(join(root, directory), { mode: 0o700 });
  for (const file of ["kek.bin", "blind-index-key.bin", "audit-source-ip-salt.bin", "records-key.bin"]) {
    await writeFile(join(root, "secrets", file), randomBytes(32), { mode: 0o600 });
  }
  return root;
}

async function connectAs(url: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: url, statement_timeout: 120_000, connectionTimeoutMillis: 30_000 });
  await client.connect();
  return client;
}

async function signIn(services: RlsAccountServices, secrets: RlsTestAccountSecrets, code: string): Promise<AuthenticatedSession & { token: string }> {
  const begun = await services.sessions.beginLogin({ email: secrets.email, password: secrets.password }, PROOF_SOURCE);
  const login = await services.sessions.completeLogin({ challengeToken: begun.challengeToken, code }, PROOF_SOURCE);
  const session = await services.sessions.authenticate(login.sessionToken, PROOF_SOURCE);
  if (session === null) throw new TypeError("RLS_PROOF_SIGN_IN_FAILED");
  return { ...session, token: login.sessionToken };
}

function totpSecretOf(uri: string): Buffer {
  const secret = new URL(uri).searchParams.get("secret");
  if (secret === null) throw new TypeError("RLS_PROOF_OTPAUTH_URI_INVALID");
  return decodeBase32(secret);
}

/** Every identifier the account's rows may name, read as the superuser after seeding (DECISIONS D62 (3)). */
async function accountIdentifiers(superuser: Pool, facts: Readonly<{ userId: string; ownerRef: string }>,
  seeded: readonly string[]): Promise<Readonly<{ sessionIds: string[]; runIds: string[]; executionRefs: string[]; all: Set<string> }>> {
  const q = async (text: string, value: string): Promise<string[]> =>
    (await superuser.query<{ id: string }>(text, [value])).rows.map((row) => row.id);
  const sessionIds = await q("SELECT session_id::text AS id FROM identity.session WHERE user_id = $1::uuid", facts.userId);
  const runIds = await q(`SELECT run_id::text AS id FROM core.run
    WHERE core.run_is_owned_by(run_id, $1::uuid, 'owner:' || $1::text)`, facts.ownerRef);
  const executionRefs = await q(`SELECT execution_ref::text AS id FROM identity.run_execution_binding
    WHERE user_id = $1::uuid`, facts.userId);
  const all = new Set([facts.userId, facts.ownerRef, ...sessionIds, ...runIds, ...executionRefs, ...seeded]);
  return { sessionIds, runIds, executionRefs, all };
}

function seededIdentifiers(report: RlsSeedReport, owners: readonly ("a" | "b" | "ab" | "ba")[]): string[] {
  const found: string[] = [];
  for (const entry of report.keys.values()) {
    for (const owner of owners) {
      for (const key of entry[owner]) {
        for (const value of JSON.parse(key) as unknown[]) {
          if (typeof value === "string" && IDENTIFIER.test(value)) found.push(value);
        }
      }
    }
  }
  return found;
}

/** Per login: the relations it may SELECT, each read as `{ k: <primary-key text>, j: <row text> }` over its own columns. */
async function readPlans(superuser: Pool, login: string, relations: readonly string[]): Promise<readonly ReadPlan[]> {
  const rows = (await superuser.query<{ relation: string; sql_name: string; columns: string[] | null; pk: string[] | null }>(`
    SELECT n.nspname || '.' || c.relname AS relation, quote_ident(n.nspname) || '.' || quote_ident(c.relname) AS sql_name,
      array_agg(quote_ident(a.attname) ORDER BY a.attnum) FILTER (WHERE has_column_privilege($1::name, c.oid, a.attnum, 'SELECT')) AS columns,
      (SELECT array_agg(quote_ident(k.attname) ORDER BY array_position(i.indkey::int2[], k.attnum))
         FROM pg_index i JOIN pg_attribute k ON k.attrelid = i.indrelid AND k.attnum = ANY (i.indkey)
        WHERE i.indrelid = c.oid AND i.indisprimary) AS pk
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    WHERE n.nspname || '.' || c.relname = ANY ($2::text[]) AND has_schema_privilege($1::name, n.oid, 'USAGE')
    GROUP BY c.oid, n.nspname, c.relname ORDER BY 1`, [login, [...relations]])).rows;
  return Object.freeze(rows.filter((row) => row.columns !== null && row.columns.length > 0).map((row) => {
    const columns = row.columns!;
    const key = row.pk !== null && row.pk.every((column) => columns.includes(column))
      ? `jsonb_build_array(${row.pk.map((column) => `x.${column}`).join(",")})::text` : "row_to_json(x)::text";
    return Object.freeze({ relation: row.relation,
      sql: `SELECT ${key} AS k, row_to_json(x)::text AS j FROM (SELECT ${columns.join(",")} FROM ${row.sql_name}) AS x` });
  }));
}

type Classifier = Readonly<{ ownKeys: ReadonlyMap<string, ReadonlySet<string>>; identifiers: ReadonlySet<string> }>;

function belongsTo(classifier: Classifier, relation: string, row: Readonly<{ k: string; j: string }>): boolean {
  if (classifier.ownKeys.get(relation)?.has(row.k) === true) return true;
  for (const identifier of classifier.identifiers) if (row.j.includes(identifier)) return true;
  return false;
}

async function readAll(client: pg.Client, plans: readonly ReadPlan[], a: Classifier): Promise<ReadonlyMap<string, ReadTally>> {
  const tallies = new Map<string, ReadTally>();
  for (const plan of plans) {
    const tally: ReadTally = { rows: 0, foreign: 0, own: 0, errors: 0 };
    try {
      for (const row of (await client.query<{ k: string; j: string }>(plan.sql)).rows) {
        tally.rows += 1;
        if (belongsTo(a, plan.relation, row)) tally.own += 1; else tally.foreign += 1;
      }
    } catch {
      tally.errors += 1;
    }
    tallies.set(plan.relation, tally);
  }
  return tallies;
}

async function setCredential(client: pg.Client, value: string): Promise<void> {
  await client.query("SELECT set_config($1, $2, false)", [CREDENTIAL_SETTING, value]);
}

type LoginWorld = Readonly<{
  login: string; url: string; plans: readonly ReadPlan[]; a: Classifier; aFacts: AccountFacts; bFacts: AccountFacts;
  bIdentifiers: ReadonlySet<string>; bTokenHash: string; forged: readonly Readonly<{ name: string; value: string }>[];
  members: readonly string[]; functions: readonly Readonly<{ signature: string; arguments: readonly string[] }>[];
  otherLogin: string; failures: ProofFailures;
}>;

/** One forgery attempt (R14): setup in the same session, then every read; widened = a foreign (A) or private (none) row. */
async function forgeryAttempt(world: LoginWorld, kind: string, mode: Mode, setup: readonly string[], transaction = false): Promise<boolean> {
  const client = await connectAs(world.url);
  try {
    if (mode === "A") await setCredential(client, world.aFacts.liveToken);
    if (transaction) await client.query("BEGIN");
    for (const statement of setup) {
      try { await client.query(statement); } catch { if (transaction) break; }
    }
    let widened = false;
    for (const [relation, tally] of await readAll(client, world.plans, world.a)) {
      if (mode === "A" ? tally.foreign > 0 : tally.rows > 0) {
        widened = true;
        world.failures.fail(world.login, relation, kind);
      }
    }
    if (transaction) await client.query("ROLLBACK").catch(() => undefined);
    return widened;
  } finally {
    await client.end().catch(() => undefined);
  }
}

/** F7: every function R42 lists (the rls functions the login may EXECUTE), under A, no context and each R9 context. */
async function functionCalls(world: LoginWorld): Promise<boolean> {
  let widened = false;
  const contexts: Readonly<{ mode: Mode; value?: string }>[] = [{ mode: "A", value: world.aFacts.liveToken }, { mode: "none" },
    ...world.forged.map(({ value }) => ({ mode: "none" as const, value }))];
  const bArgument = (type: string, name: string): readonly string[] =>
    name === "p_run_id" ? world.bFacts.runIds
      : name === "p_execution_ref" ? world.bFacts.executionRefs
        : type === "uuid" ? [world.bFacts.userId, world.bFacts.ownerRef] : [world.bFacts.userId];
  for (const context of contexts) {
    const client = await connectAs(world.url);
    try {
      if (context.value !== undefined) await setCredential(client, context.value);
      for (const fn of world.functions) {
        const parameters = fn.arguments.map((argument) => {
          const [name, type] = argument.split(" ") as [string, string];
          return { name, type };
        });
        const calls: (readonly (string | null)[])[] = [parameters.map(() => null)];
        for (const [index, parameter] of parameters.entries()) {
          for (const value of bArgument(parameter.type, parameter.name)) {
            calls.push(parameters.map((_, at) => at === index ? value : null));
          }
        }
        for (const values of calls) {
          const placeholders = parameters.map((parameter, at) => `$${at + 1}::${parameter.type}`).join(",");
          let result: unknown = null;
          try {
            result = (await client.query<{ r: unknown }>(`SELECT ${fn.signature}(${placeholders}) AS r`, [...values])).rows[0]?.r ?? null;
          } catch {
            continue;
          }
          const text = result === null ? "" : String(result);
          const withB = values.some((value) => value !== null);
          const leaks = [...world.bIdentifiers].some((identifier) => text.includes(identifier))
            || (withB && result === true)
            || (context.mode === "none" && result !== null && result !== false);
          if (leaks) {
            widened = true;
            world.failures.fail(world.login, fn.signature, "F7");
          }
        }
      }
    } finally {
      await client.end().catch(() => undefined);
    }
  }
  return widened;
}

/** F1-F8 for one login (SPEC-v4 R14); returns how many of the eight kinds widened anything. */
async function forgeries(world: LoginWorld): Promise<Readonly<{ kinds: number; widened: number }>> {
  const literal = (value: string): string => `'${value.replaceAll("'", "''")}'`;
  // F1's value for the credential name: B's token_hash as stored, a forged credential (R9).
  const forgedCredential = world.bTokenHash;
  const settings: readonly Readonly<{ name: string; value: string; set: string }>[] = [
    { name: CREDENTIAL_SETTING, value: forgedCredential, set: `${CREDENTIAL_SETTING} TO ${literal(forgedCredential)}` },
    { name: "row_security", value: "off", set: "row_security TO off" },
    { name: "search_path", value: "pg_temp, public", set: "search_path TO pg_temp, public" },
    { name: "role", value: "debateai_rls_all_accounts", set: "role TO debateai_rls_all_accounts" }
  ];
  const kinds = new Map<string, boolean>();
  const record = (kind: string, widened: boolean): void => { kinds.set(kind, (kinds.get(kind) ?? false) || widened); };
  for (const mode of ["A", "none"] as const) {
    for (const setting of settings) {
      record("F1", await forgeryAttempt(world, "F1", mode, [`SELECT set_config(${literal(setting.name)}, ${literal(setting.value)}, false)`]));
      record("F1", await forgeryAttempt(world, "F1", mode, [`SET ${setting.set}`]));
      record("F1", await forgeryAttempt(world, "F1", mode, [`SET LOCAL ${setting.set}`], true));
      record("F8", await forgeryAttempt(world, "F8", mode, [`SET ${setting.set}`, "SAVEPOINT s", "ROLLBACK TO SAVEPOINT s"], true));
    }
    for (const role of world.members) record("F2", await forgeryAttempt(world, "F2", mode, [`SET ROLE ${role}`]));
    for (const statement of ["RESET ROLE", "RESET ALL", "DISCARD ALL"]) record("F3", await forgeryAttempt(world, "F3", mode, [statement]));
    for (const role of [SUPERUSER, world.otherLogin]) {
      record("F4", await forgeryAttempt(world, "F4", mode, [`SET SESSION AUTHORIZATION ${role}`]));
    }
  }
  for (const value of [world.bFacts.userId, world.bFacts.ownerRef]) {
    record("F5", await forgeryAttempt(world, "F5", "none", [`SELECT set_config(${literal(CREDENTIAL_SETTING)}, ${literal(value)}, false)`]));
  }
  for (const value of [...world.bFacts.sessionIds.slice(0, 1), world.bTokenHash]) {
    record("F6", await forgeryAttempt(world, "F6", "none", [`SELECT set_config(${literal(CREDENTIAL_SETTING)}, ${literal(value)}, false)`]));
  }
  record("F7", await functionCalls(world));
  return Object.freeze({ kinds: kinds.size, widened: [...kinds.values()].filter(Boolean).length });
}

/** R7, R8, R9 and F1-F8 for one login; prints its four R39 lines; true when every check holds. */
async function proveLogin(world: LoginWorld, out: (line: string) => void): Promise<boolean> {
  let held = true;
  const client = await connectAs(world.url);
  let foreign = 0;
  const ownByRelation = new Map<string, number>();
  try {
    await setCredential(client, world.aFacts.liveToken);
    for (const [relation, tally] of await readAll(client, world.plans, world.a)) {
      foreign += tally.foreign;
      ownByRelation.set(relation, tally.own);
      if (tally.foreign > 0 || tally.errors > 0) world.failures.fail(world.login, relation, "R7");
    }
  } finally {
    await client.end().catch(() => undefined);
  }
  const ownRelations = L5F12_RELATIONS.filter((relation) => ownByRelation.has(relation));
  const unseen = ownRelations.filter((relation) => (ownByRelation.get(relation) ?? 0) === 0);
  for (const relation of unseen) world.failures.fail(world.login, relation, "R7_OWN_ROWS");
  const ownSeen = ownRelations.length > 0 && unseen.length === 0;
  held &&= foreign === 0 && ownSeen;
  out(`RLS_PROOF login=${world.login} context=A foreign_rows=${foreign} own_rows_seen=${ownSeen ? "yes" : "no"}`);
  const plain = async (value: string | undefined, requirement: string): Promise<Readonly<{ rows: number; errors: number }>> => {
    const session = await connectAs(world.url);
    try {
      if (value !== undefined) await setCredential(session, value);
      let rows = 0, errors = 0;
      for (const [relation, tally] of await readAll(session, world.plans, world.a)) {
        rows += tally.rows;
        errors += tally.errors;
        if (tally.rows > 0 || tally.errors > 0) world.failures.fail(world.login, relation, requirement);
      }
      return { rows, errors };
    } finally {
      await session.end().catch(() => undefined);
    }
  };
  const none = await plain(undefined, "R8");
  held &&= none.rows === 0 && none.errors === 0;
  out(`RLS_PROOF login=${world.login} context=none private_rows=${none.rows} errors=${none.errors}`);
  let forgedRows = 0, forgedErrors = 0;
  for (const { value } of world.forged) {
    const read = await plain(value, "R9");
    forgedRows += read.rows;
    forgedErrors += read.errors;
  }
  held &&= forgedRows === 0 && forgedErrors === 0;
  out(`RLS_PROOF login=${world.login} context=forged private_rows=${forgedRows} errors=${forgedErrors}`);
  const forged = await forgeries(world);
  held &&= forged.kinds === 8 && forged.widened === 0;
  if (forged.kinds !== 8) world.failures.fail(world.login, "-", "R14");
  out(`RLS_PROOF login=${world.login} forgeries=${forged.kinds} widened=${forged.widened}`);
  return held;
}

async function prove(options: Readonly<{ emulateBase?: boolean; out: (line: string) => void }>, cleanup: Cleanup): Promise<number> {
  const out = options.out;
  const failures = new ProofFailures(out);
  const superuserUrl = await startThrowawayCluster(cleanup);
  const superuser = createPool(superuserUrl, { max: 4 });
  cleanup.push(() => superuser.end());
  await migrate(superuser);
  const migratedTo = (await superuser.query<{ name: string }>(`SELECT name FROM public.debateai_schema_migration
    WHERE name ~ '^[0-9]{4}_' ORDER BY name DESC LIMIT 1`)).rows[0]!.name;
  const inScope = (await superuser.query<{ relation: string; kind: string }>(RLS_SCOPE_RULE_SQL)).rows;
  if (options.emulateBase === true) {
    // The base has no row security (SPEC-v4 §1, L5-F12): the proof must fail on it.
    for (const { relation, kind } of inScope) {
      if (kind !== "r") continue;
      const sqlName = (await superuser.query<{ name: string }>(
        "SELECT quote_ident(split_part($1, '.', 1)) || '.' || quote_ident(split_part($1, '.', 2)) AS name", [relation])).rows[0]!.name;
      await superuser.query(`ALTER TABLE ${sqlName} DISABLE ROW LEVEL SECURITY`);
    }
  }
  out(`RLS_PROOF cluster=throwaway migrated_to=${migratedTo.endsWith(".sql") ? migratedTo : `${migratedTo}.sql`} in_scope=${inScope.length}`);

  const credentialDirectory = await privateTemporaryDirectory("debateai-rls-proof-dev-", cleanup);
  const credentialFilePath = join(credentialDirectory, "database-principals.env");
  await provisionDevelopmentDatabasePrincipals({ adminPool: superuser, adminDatabaseUrl: superuserUrl, credentialFilePath });
  const development = readEnvironmentFile(await readFile(credentialFilePath, "utf8"));
  const production = await provisionProductionLogins(superuser, superuserUrl, cleanup);
  const urlOf = (entry: (typeof PROOF_LOGINS)[number]): string => {
    const url = "production" in entry ? production.get(entry.production) : development.get(entry.development);
    if (url === undefined || decodeURIComponent(new URL(url).username) !== entry.login) throw new TypeError("RLS_PROOF_LOGIN_MISSING");
    return url;
  };
  const bootstrap = await loadBootstrapRegister();
  await persistBootstrapRegister(superuser, bootstrap);
  const custodyRoot = await throwawayCustodyRoot(cleanup);
  // The pools exactly as tools/rls/test-accounts-cli.ts builds them (as main.ts wires `pool` and `authorizationPool`).
  const developmentUrl = (key: string): string => {
    const url = development.get(key);
    if (url === undefined) throw new TypeError("RLS_PROOF_DEVELOPMENT_LOGIN_MISSING");
    return url;
  };
  const system = createPool(developmentUrl("API_SYSTEM_DATABASE_URL"));
  const authorizationSystem = createPool(developmentUrl("API_AUTHORIZATION_SYSTEM_DATABASE_URL"));
  const pools = Object.freeze({
    runtime: createPool(developmentUrl("DATABASE_URL"), { crossAccount: system }),
    authorization: createPool(developmentUrl("AUTHORIZATION_DATABASE_URL"), { crossAccount: authorizationSystem })
  });
  cleanup.push(async () => {
    for (const pool of [pools.runtime, pools.authorization, system, authorizationSystem]) await pool.end().catch(() => undefined);
  });
  const accountOptions = { custodyRoot, registerVersion: bootstrap.registerVersion };
  const made = await createRlsTestAccounts(pools, accountOptions);
  const secrets = await readRlsTestAccountsFile(made.path);
  const services = await openRlsAccountServices(pools, accountOptions);
  cleanup.push(() => services.close());
  const [aRecord, bRecord] = made.accounts;
  const lastStep = (await superuser.query<{ step: string }>(`SELECT coalesce(max(last_accepted_step), -1)::text AS step
    FROM identity.mfa_factor WHERE user_id = ANY ($1::uuid[])`, [[aRecord.userId, bRecord.userId]])).rows[0]!.step;
  const step = await rlsWaitForTotpStepAfter(Number.parseInt(lastStep, 10), services.totpPeriodSeconds);
  const aLive = await signIn(services, secrets.A, totpCodeAtStep(totpSecretOf(secrets.A.otpauthUri), step));
  const bLive = await signIn(services, secrets.B, totpCodeAtStep(totpSecretOf(secrets.B.otpauthUri), step));
  const bExpired = await signIn(services, secrets.B, secrets.B.recoveryCodes[1]);
  const bRevoked = await signIn(services, secrets.B, secrets.B.recoveryCodes[0]);
  if (!await services.sessions.revokeSession(bRevoked, bRevoked.session.session_id, PROOF_SOURCE)) {
    throw new TypeError("RLS_PROOF_REVOKE_FAILED");
  }

  const ownerRefOf = async (userId: string): Promise<string> => (await superuser.query<{ owner_ref: string }>(
    `SELECT owner_ref::text AS owner_ref FROM identity."user" WHERE user_id = $1`, [userId])).rows[0]!.owner_ref;
  const a = { userId: aRecord.userId, ownerRef: await ownerRefOf(aRecord.userId) };
  const b = { userId: bRecord.userId, ownerRef: await ownerRefOf(bRecord.userId) };
  const report = await seedRlsRows(superuser, a, b);
  // R9's expired token: B's third session ends one second ago (seeding, R35); its CHECK keeps it after created_at.
  await superuser.query(`UPDATE identity.session SET idle_expires_at = greatest(created_at + interval '1 millisecond',
    statement_timestamp() - interval '1 second') WHERE session_id = $1`, [bExpired.session.session_id]);
  const withRowsOfB = (await superuser.query<{ relation: string }>(`
    SELECT 'core.run' AS relation WHERE EXISTS (SELECT 1 FROM core.run WHERE core.run_is_owned_by(run_id, $2::uuid, 'owner:' || $2::text))
    UNION ALL SELECT 'serve.answer' WHERE EXISTS (SELECT 1 FROM serve.answer WHERE core.run_is_owned_by(run_id, $2::uuid, 'owner:' || $2::text))
    UNION ALL SELECT 'identity.user' WHERE EXISTS (SELECT 1 FROM identity."user" WHERE user_id = $1)
    UNION ALL SELECT 'identity.session' WHERE EXISTS (SELECT 1 FROM identity.session WHERE user_id = $1)
    UNION ALL SELECT 'identity.mfa_factor' WHERE EXISTS (SELECT 1 FROM identity.mfa_factor WHERE user_id = $1)
    UNION ALL SELECT 'identity.recovery_code' WHERE EXISTS (SELECT 1 FROM identity.recovery_code WHERE user_id = $1)`,
  [b.userId, b.ownerRef])).rows.map((row) => row.relation);
  for (const relation of L5F12_RELATIONS) if (!withRowsOfB.includes(relation)) failures.fail("-", relation, "R38");
  out(`RLS_PROOF seeded l5f12_relations_with_rows_of_b=${withRowsOfB.length}/${L5F12_RELATIONS.length}`);

  const onlyB = new Set(seededIdentifiers(report, ["b"]));
  const aIds = await accountIdentifiers(superuser, a,
    seededIdentifiers(report, ["a", "ab", "ba"]).filter((value) => !onlyB.has(value)));
  const bIds = await accountIdentifiers(superuser, b, [...onlyB]);
  const bTokenHash = (await superuser.query<{ token_hash: string }>(
    "SELECT token_hash FROM identity.session WHERE session_id = $1", [bLive.session.session_id])).rows[0]!.token_hash;
  const aFacts: AccountFacts = Object.freeze({ ...a, liveToken: aLive.token, sessionIds: aIds.sessionIds, runIds: aIds.runIds,
    executionRefs: aIds.executionRefs });
  const bFacts: AccountFacts = Object.freeze({ ...b, liveToken: bLive.token, sessionIds: [bLive.session.session_id],
    runIds: bIds.runIds, executionRefs: bIds.executionRefs });
  const ownKeys = new Map([...report.keys].map(([relation, entry]) => [relation, new Set([...entry.a, ...entry.ab, ...entry.ba])] as const));
  const classifier: Classifier = Object.freeze({ ownKeys, identifiers: aIds.all });
  const bIdentifiers = new Set([...bIds.all].filter((identifier) => !aIds.all.has(identifier)));
  // R9: 32 random bytes; B's session_id; B's token_hash as stored; a revoked B token; an expired B token.
  const forged = Object.freeze([
    { name: "random", value: randomBytes(32).toString("base64url") },
    { name: "session_id", value: bLive.session.session_id },
    { name: "token_hash", value: bTokenHash },
    { name: "revoked", value: bRevoked.token },
    { name: "expired", value: bExpired.token }
  ]);
  const relations = inScope.map(({ relation }) => relation);
  let held = failures.lines.size === 0;
  for (const entry of PROOF_LOGINS) {
    const url = urlOf(entry);
    const members = (await superuser.query<{ role: string }>(`SELECT quote_ident(r.rolname) AS role FROM pg_roles r
      WHERE pg_has_role($1::name, r.oid, 'MEMBER') ORDER BY r.rolname`, [entry.login])).rows.map((row) => row.role);
    const functions = (await superuser.query<{ signature: string; arguments: string }>(`
      SELECT quote_ident(n.nspname) || '.' || quote_ident(p.proname) AS signature,
        pg_get_function_identity_arguments(p.oid) AS arguments
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'rls' AND has_function_privilege($1::name, p.oid, 'EXECUTE') ORDER BY 1`, [entry.login])).rows
      .map((row) => Object.freeze({ signature: row.signature,
        arguments: row.arguments === "" ? [] : row.arguments.split(", ") }));
    const world: LoginWorld = Object.freeze({
      login: entry.login, url, plans: await readPlans(superuser, entry.login, relations), a: classifier, aFacts, bFacts,
      bIdentifiers, bTokenHash, forged, members, functions,
      otherLogin: entry.login === "debateai_dev_runtime" ? "debateai_dev_api_system" : "debateai_dev_runtime", failures
    });
    held = await proveLogin(world, out) && held;
  }
  if (!held || failures.lines.size > 0) return 1;
  out(`RLS_PROOF_OK logins=${PROOF_LOGINS.length} foreign_rows=0 private_rows=0 widened=0`);
  return 0;
}

/** `pnpm run rls:proof` (SPEC-v4 R38-R40): the exit code; reads nothing from the environment (D53). */
export async function runRlsProof(options: Readonly<{ emulateBase?: boolean; out: (line: string) => void }>): Promise<number> {
  const cleanup: Cleanup = [];
  try {
    return await prove(options, cleanup);
  } catch (error) {
    options.out(`RLS_PROOF_FAILED - - ${failureCode(error)}`);
    return 2;
  } finally {
    for (const step of cleanup.reverse()) await step().catch(() => undefined);
  }
}

function invokedAsScript(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedAsScript()) {
  process.exitCode = await runRlsProof({ out: (line) => { console.log(line); } });
  // embedded-postgres's exit hook would end the process with code 0 once the loop drains: flush stdout, then exit with
  // the proof's own code.
  await new Promise<void>((resolveFlush) => { process.stdout.write("", () => { resolveFlush(); }); });
  process.exit(process.exitCode);
}
